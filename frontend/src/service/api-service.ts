import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'
import { notifySessionExpired } from '@/context/auth/session-expiry'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'
import {
  FOREST_CLIENT_SELECTION_HEADER,
  getActiveForestClientNumber,
} from '@/service/forest-client-selection'
import {
  RECORD_VERSION_HEADER,
  createOptimisticConflictEvent,
  type OptimisticConflictProblem,
  type OptimisticRecordType,
} from '@/service/optimistic-conflict'
import { reloadPageIgnoringUnsavedChanges } from '@/utils/page-unload'

type CachedGetOptions = {
  ttlMs?: number
  cacheKey?: string
}

type CachedResponse = {
  expiresAt: number
  response: AxiosResponse<unknown>
}

type AuthCacheContext = {
  cacheScope: string
  authorizationHeader?: string
}

type RecordSnapshot = {
  version: string
  primarySourceKey: string
  sources: RecordSnapshotSource[]
}

type RecordSnapshotSource = {
  detailUrl: string
  detailConfig?: AxiosRequestConfig
  data: unknown
}

type ActiveRecord = {
  recordType: OptimisticRecordType
  recordId: string
}

type HeaderAccessors = {
  get?: (name: string) => unknown
  has?: (name: string) => boolean
  set?: (name: string, value: string) => void
  toJSON?: () => Record<string, unknown>
}

const RESPONSE_CACHE_MAX_ENTRIES = 150
const CONFLICT_CHANGED_FIELD_LIMIT = 5
const CONFLICT_ENRICHMENT_TIMEOUT_MS = 10_000
const CACHE_INVALIDATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])
const CONFLICT_DIFF_IGNORED_FIELDS = new Set([
  'entryTimestamp',
  'entryUserId',
  'entryUserid',
  'locked',
  'lockedBy',
  'lockHeldByCurrentUser',
  'lockMessage',
  'lockExpiresAt',
  'recordVersion',
  'savedAt',
  'updatedAt',
  'updatedBy',
  'updateTimestamp',
  'updateUserId',
  'updateUserid',
  'lastUpdatedBy',
])

const RECORD_IDENTIFIER_KEYS: Record<OptimisticRecordType, ReadonlySet<string>> = {
  application: new Set([
    'applicationnumber',
    'applicationnumbers',
    'legacyapplicationnumber',
    'oicapplicationnumber',
    'selectedapplications',
  ]),
  'federal-application': new Set(['applicationnumber', 'fedapplicationnumber']),
  exemption: new Set(['exemptionnumber', 'exemptionnumbers', 'legacyexemptionnumber']),
  permit: new Set([
    'permitnumber',
    'exportpermitdetailid',
    'exportpermitdetailnumber',
    'legacypermitnumber',
  ]),
  offer: new Set(['exportpurchaseoffernumber', 'offernumber', 'purchaseoffernumber']),
}

const isCacheInvalidatingMethod = (method: string | undefined): boolean =>
  CACHE_INVALIDATING_METHODS.has(method?.trim().toLowerCase() ?? '')

class APIService {
  private readonly client: AxiosInstance
  private readonly responseCache = new Map<string, CachedResponse>()
  private readonly inFlightGets = new Map<string, Promise<AxiosResponse<unknown>>>()
  private readonly recordSnapshots = new Map<string, RecordSnapshot>()
  private cacheGeneration = 0

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.client.interceptors.request.use(async (config) => {
      const requestConfig = config
      requestConfig.headers = requestConfig.headers ?? {}

      if (isCacheInvalidatingMethod(requestConfig.method)) {
        const recordVersion = this.requestTargetsActiveRecord(requestConfig)
          ? this.activeRecordVersion()
          : undefined
        if (recordVersion && !this.hasHeader(requestConfig.headers, RECORD_VERSION_HEADER)) {
          this.setHeader(requestConfig.headers, RECORD_VERSION_HEADER, recordVersion)
        }
        this.clearCachedGetData()
        clearAllPageDataCache()
      }

      if (!this.hasHeader(requestConfig.headers, 'authorization')) {
        try {
          const { tokens } = (await fetchAuthSession()) ?? {}
          const accessToken = tokens?.accessToken?.toString()
          if (accessToken) {
            this.setHeader(requestConfig.headers, 'Authorization', `Bearer ${accessToken}`)
          }
        } catch {
          notifySessionExpired('token-unavailable')
        }
      }

      const activeForestClientNumber = getActiveForestClientNumber()
      if (
        activeForestClientNumber &&
        !this.hasHeader(requestConfig.headers, FOREST_CLIENT_SELECTION_HEADER)
      ) {
        this.setHeader(
          requestConfig.headers,
          FOREST_CLIENT_SELECTION_HEADER,
          activeForestClientNumber,
        )
      }

      const csrfCookie = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
      if (csrfCookie?.[1]) {
        this.setHeader(requestConfig.headers, 'X-XSRF-TOKEN', decodeURIComponent(csrfCookie[1]))
      }

      return requestConfig
    })

    this.client.interceptors.response.use(
      (response) => {
        this.registerSuccessfulMutationVersion(response)
        return response
      },
      (error: unknown) => {
        const status = this.responseStatus(error)
        if (status === 401) {
          this.clearCachedGetData()
          this.clearRecordVersions()
          notifySessionExpired('api-unauthorized')
        }
        const optimisticConflictProblem = this.optimisticConflictProblem(error)
        if ((status === 409 || status === 428) && optimisticConflictProblem) {
          return this.handleOptimisticConflict(error, optimisticConflictProblem)
        }
        return Promise.reject(error)
      },
    )
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client
  }

  public clearCachedGetData(): void {
    this.cacheGeneration += 1
    this.responseCache.clear()
    this.inFlightGets.clear()
  }

  public clearRecordVersions(): void {
    this.recordSnapshots.clear()
  }

  public registerRecordVersion(
    recordType: OptimisticRecordType,
    recordId: string,
    response: Pick<AxiosResponse<unknown>, 'headers' | 'data'>,
    detailUrl: string,
    detailConfig?: AxiosRequestConfig,
  ): void {
    const version = this.getHeader(response.headers, RECORD_VERSION_HEADER)
    if (typeof version !== 'string' || !version.trim()) {
      return
    }
    const key = this.recordVersionKey(recordType, recordId)
    const existing = this.recordSnapshots.get(key)
    const source: RecordSnapshotSource = { detailUrl, detailConfig, data: response.data }
    const sourceKey = this.snapshotSourceKey(source)
    const primarySourceKey = existing?.primarySourceKey ?? sourceKey
    const existingSourceIndex = existing?.sources.findIndex(
      (entry) => this.snapshotSourceKey(entry) === sourceKey,
    )
    const sources = existing ? [...existing.sources] : []
    if (existingSourceIndex !== undefined && existingSourceIndex >= 0) {
      sources[existingSourceIndex] = source
    } else {
      sources.push(source)
    }
    this.recordSnapshots.set(key, {
      version: !existing || sourceKey === primarySourceKey ? version.trim() : existing.version,
      primarySourceKey,
      sources,
    })
  }

  public async getCachedData<T>(
    path: string,
    config?: AxiosRequestConfig,
    options?: CachedGetOptions,
  ): Promise<T> {
    const response = await this.getCachedResponse<T>(path, config, options)
    return response.data
  }

  public async getCachedResponse<T>(
    path: string,
    config: AxiosRequestConfig = {},
    options: CachedGetOptions = {},
  ): Promise<AxiosResponse<T>> {
    const ttlMs = options.ttlMs ?? 30_000
    if (ttlMs <= 0) {
      return this.client.get<T>(path, config)
    }
    if (this.hasHeader(config.headers, 'authorization')) {
      return this.client.get<T>(path, config)
    }

    const authContext = await this.resolveAuthCacheContext()
    if (!authContext) {
      return this.client.get<T>(path, config)
    }

    const requestConfig = authContext.authorizationHeader
      ? this.withAuthorizationHeader(config, authContext.authorizationHeader)
      : config
    const key = this.buildCacheKey(path, requestConfig, options.cacheKey, authContext.cacheScope)
    const cacheGeneration = this.cacheGeneration
    const now = Date.now()
    const cachedResponse = this.responseCache.get(key)
    if (cachedResponse && cachedResponse.expiresAt > now) {
      this.responseCache.delete(key)
      this.responseCache.set(key, cachedResponse)
      return cachedResponse.response as AxiosResponse<T>
    }
    if (cachedResponse) {
      this.responseCache.delete(key)
    }

    const inFlightGet = this.inFlightGets.get(key)
    if (inFlightGet) {
      return inFlightGet as Promise<AxiosResponse<T>>
    }

    const request = this.client
      .get<T>(path, requestConfig)
      .then((response) => {
        if (this.cacheGeneration === cacheGeneration) {
          this.removeExpiredCachedResponses()
          this.responseCache.set(key, {
            expiresAt: Date.now() + ttlMs,
            response: response as AxiosResponse<unknown>,
          })
          this.enforceResponseCacheLimit()
        }
        return response as AxiosResponse<unknown>
      })
      .finally(() => {
        if (this.inFlightGets.get(key) === request) {
          this.inFlightGets.delete(key)
        }
      })

    this.inFlightGets.set(key, request)
    return request as Promise<AxiosResponse<T>>
  }

  private removeExpiredCachedResponses(): void {
    const now = Date.now()
    for (const [key, cachedResponse] of this.responseCache.entries()) {
      if (cachedResponse.expiresAt <= now) {
        this.responseCache.delete(key)
      }
    }
  }

  private enforceResponseCacheLimit(): void {
    while (this.responseCache.size > RESPONSE_CACHE_MAX_ENTRIES) {
      const oldestKey = this.responseCache.keys().next().value
      if (!oldestKey) {
        return
      }
      this.responseCache.delete(oldestKey)
    }
  }

  private buildCacheKey(
    path: string,
    config: AxiosRequestConfig,
    customCacheKey?: string,
    authScope = 'anonymous',
  ): string {
    if (customCacheKey) {
      return `${authScope}|${customCacheKey}`
    }

    return [
      authScope,
      path,
      this.serializeParams(config.params),
      config.responseType ?? '',
      this.serializeHeaders(config.headers),
    ].join('|')
  }

  private async resolveAuthCacheContext(): Promise<AuthCacheContext | null> {
    try {
      const { tokens } = (await fetchAuthSession()) ?? {}
      const accessToken = tokens?.accessToken?.toString()
      const payload = tokens?.accessToken?.payload ?? tokens?.idToken?.payload
      const subject = this.asCachePart(payload?.sub)
      const username = this.asCachePart(payload?.username)
      const identityProvider = this.asCachePart(payload?.identity_provider)
      const clientId = this.asCachePart(payload?.client_id)
      const forestClientNumber = getActiveForestClientNumber()
      const identityScopeParts = [subject, username, identityProvider, clientId].filter(Boolean)
      const identityScope =
        identityScopeParts.length > 0
          ? identityScopeParts.join(':')
          : accessToken
            ? `token:${this.hashCacheScope(accessToken)}`
            : 'anonymous'
      const forestClientScope = forestClientNumber
        ? `forest-client:${forestClientNumber}`
        : 'forest-client:unselected'
      return {
        cacheScope: `${identityScope}:${forestClientScope}`,
        authorizationHeader: accessToken ? `Bearer ${accessToken}` : undefined,
      }
    } catch {
      return null
    }
  }

  private withAuthorizationHeader(
    config: AxiosRequestConfig,
    authorizationHeader: string,
  ): AxiosRequestConfig {
    return {
      ...config,
      headers: {
        ...this.toHeaderRecord(config.headers),
        Authorization: authorizationHeader,
      },
    }
  }

  private hasHeader(headers: unknown, headerName: string): boolean {
    const headerValue = this.getHeader(headers, headerName)
    return headerValue !== undefined && headerValue !== null && String(headerValue).length > 0
  }

  private getHeader(headers: unknown, headerName: string): unknown {
    if (!headers || typeof headers !== 'object') {
      return undefined
    }

    const normalizedName = headerName.toLowerCase()
    const accessors = headers as HeaderAccessors

    if (typeof accessors.has === 'function' && typeof accessors.get === 'function') {
      try {
        if (accessors.has(headerName) || accessors.has(normalizedName)) {
          return accessors.get(headerName) ?? accessors.get(normalizedName)
        }
      } catch {
        // Fall through to record-based header lookup.
      }
    }

    if (typeof accessors.get === 'function') {
      try {
        const value = accessors.get(headerName) ?? accessors.get(normalizedName)
        if (value !== undefined && value !== null) {
          return value
        }
      } catch {
        // Fall through to record-based header lookup.
      }
    }

    const headerRecord = this.toHeaderRecord(headers)
    return Object.entries(headerRecord).find(([key]) => key.toLowerCase() === normalizedName)?.[1]
  }

  private setHeader(headers: unknown, headerName: string, value: string): void {
    if (!headers || typeof headers !== 'object') {
      return
    }

    const accessors = headers as HeaderAccessors
    if (typeof accessors.set === 'function') {
      accessors.set(headerName, value)
      return
    }

    ;(headers as Record<string, unknown>)[headerName] = value
  }

  private responseStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined
    }

    const status = (error as { response?: { status?: unknown } }).response?.status
    return typeof status === 'number' ? status : undefined
  }

  private optimisticConflictProblem(error: unknown): OptimisticConflictProblem | null {
    if (!error || typeof error !== 'object') {
      return null
    }

    const data = (error as { response?: { data?: unknown } }).response?.data
    if (!data || typeof data !== 'object') {
      return null
    }

    const problem = data as Record<string, unknown>
    if (problem.code !== 'STALE_RECORD' && problem.code !== 'RECORD_VERSION_REQUIRED') {
      return null
    }

    return {
      code: problem.code,
      detail: typeof problem.detail === 'string' ? problem.detail : undefined,
      currentVersion:
        typeof problem.currentVersion === 'string' ? problem.currentVersion : undefined,
      changedFields: problem.changedFields,
      savedAt: typeof problem.savedAt === 'string' ? problem.savedAt : undefined,
      updatedBy: typeof problem.updatedBy === 'string' ? problem.updatedBy : undefined,
    }
  }

  private handleOptimisticConflict(
    error: unknown,
    problem: OptimisticConflictProblem,
  ): Promise<AxiosResponse<unknown>> {
    const originalConfig =
      error && typeof error === 'object'
        ? (error as { config?: AxiosRequestConfig }).config
        : undefined
    if (!originalConfig) {
      return Promise.reject(error)
    }

    const authorizationHeader = this.getHeader(originalConfig.headers, 'authorization')
    return this.enrichOptimisticConflictWithinTimeout(
      problem,
      typeof authorizationHeader === 'string' ? authorizationHeader : undefined,
    ).then(
      (enrichedProblem) =>
        new Promise<AxiosResponse<unknown>>((_, reject) => {
          const event = createOptimisticConflictEvent({
            problem: enrichedProblem,
            refresh: () => {
              this.clearCachedGetData()
              this.clearRecordVersions()
              clearAllPageDataCache()
              reject(error)
              reloadPageIgnoringUnsavedChanges()
            },
          })

          const handled = !window.dispatchEvent(event)
          if (!handled) {
            reject(error)
          }
        }),
    )
  }

  private async enrichOptimisticConflictWithinTimeout(
    problem: OptimisticConflictProblem,
    authorizationHeader?: string,
  ): Promise<OptimisticConflictProblem> {
    const controller = new AbortController()
    let timeoutId: number | undefined
    const timeout = new Promise<OptimisticConflictProblem>((resolve) => {
      timeoutId = window.setTimeout(() => {
        controller.abort()
        resolve(problem)
      }, CONFLICT_ENRICHMENT_TIMEOUT_MS)
    })

    try {
      return await Promise.race([
        this.enrichOptimisticConflict(problem, controller.signal, authorizationHeader),
        timeout,
      ])
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }

  private registerSuccessfulMutationVersion(response: AxiosResponse<unknown>): void {
    const activeRecord = this.activeRecord()
    if (
      !activeRecord ||
      !isCacheInvalidatingMethod(response.config?.method) ||
      !this.requestTargetsRecord(response.config, activeRecord)
    ) {
      return
    }
    const version = this.getHeader(response.headers, RECORD_VERSION_HEADER)
    if (typeof version !== 'string' || !version.trim()) {
      return
    }
    const key = this.recordVersionKey(activeRecord.recordType, activeRecord.recordId)
    const snapshot = this.recordSnapshots.get(key)
    if (snapshot) {
      this.recordSnapshots.set(key, { ...snapshot, version: version.trim() })
    }
  }

  private activeRecordVersion(): string | undefined {
    const activeRecord = this.activeRecord()
    return activeRecord
      ? this.recordSnapshots.get(
          this.recordVersionKey(activeRecord.recordType, activeRecord.recordId),
        )?.version
      : undefined
  }

  private async enrichOptimisticConflict(
    problem: OptimisticConflictProblem,
    signal: AbortSignal,
    authorizationHeader?: string,
  ): Promise<OptimisticConflictProblem> {
    const activeRecord = this.activeRecord()
    if (!activeRecord) {
      return problem
    }
    const snapshot = this.recordSnapshots.get(
      this.recordVersionKey(activeRecord.recordType, activeRecord.recordId),
    )
    if (!snapshot?.sources.length) {
      return problem
    }

    try {
      const latestSources: unknown[] = []
      const changedFields: unknown[] = []
      let latestVersion: unknown
      const sourceResults = await Promise.allSettled(
        snapshot.sources.map(async (source) => ({
          source,
          latestResponse: await this.client.get<unknown>(source.detailUrl, {
            ...source.detailConfig,
            headers: {
              ...this.toHeaderRecord(source.detailConfig?.headers),
              ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
              'Cache-Control': 'no-cache',
            },
            signal,
          }),
        })),
      )
      for (const sourceResult of sourceResults) {
        if (sourceResult.status === 'rejected') continue
        const { source, latestResponse } = sourceResult.value
        latestSources.push(latestResponse.data)
        if (this.snapshotSourceKey(source) === snapshot.primarySourceKey) {
          latestVersion = this.getHeader(latestResponse.headers, RECORD_VERSION_HEADER)
        }
        changedFields.push(...this.collectChangedFields(source.data, latestResponse.data))
      }
      const suppliedFields = this.hasChangedFields(problem.changedFields)
      return {
        ...problem,
        currentVersion:
          typeof latestVersion === 'string' && latestVersion.trim()
            ? latestVersion.trim()
            : problem.currentVersion,
        changedFields: suppliedFields
          ? problem.changedFields
          : changedFields.slice(0, CONFLICT_CHANGED_FIELD_LIMIT),
        savedAt:
          problem.savedAt ??
          this.readFirstTextField(latestSources, ['savedAt', 'updatedAt', 'updateTimestamp']),
        updatedBy:
          problem.updatedBy ??
          this.readFirstTextField(latestSources, [
            'updatedBy',
            'updateUserId',
            'updateUserid',
            'lastUpdatedBy',
          ]),
      }
    } catch {
      return problem
    }
  }

  private collectChangedFields(original: unknown, latest: unknown): unknown[] {
    const changedFields: unknown[] = []
    this.compareRecordValues(original, latest, '', 0, changedFields)
    return changedFields
  }

  private compareRecordValues(
    original: unknown,
    latest: unknown,
    path: string,
    depth: number,
    changedFields: unknown[],
  ): void {
    if (
      changedFields.length >= CONFLICT_CHANGED_FIELD_LIMIT ||
      this.valuesEqual(original, latest)
    ) {
      return
    }

    const originalRecord = this.asPlainRecord(original)
    const latestRecord = this.asPlainRecord(latest)
    if (originalRecord && latestRecord && depth < 3) {
      const keys = new Set([...Object.keys(originalRecord), ...Object.keys(latestRecord)])
      for (const key of keys) {
        if (CONFLICT_DIFF_IGNORED_FIELDS.has(key)) continue
        this.compareRecordValues(
          originalRecord[key],
          latestRecord[key],
          path ? `${path}.${key}` : key,
          depth + 1,
          changedFields,
        )
        if (changedFields.length >= CONFLICT_CHANGED_FIELD_LIMIT) return
      }
      return
    }

    changedFields.push({
      field: path || 'record',
      currentValue: this.compactConflictValue(latest),
    })
  }

  private asPlainRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  }

  private valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    } catch {
      return false
    }
  }

  private compactConflictValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.length > 100 ? `${value.slice(0, 97)}...` : value
    }
    if (Array.isArray(value)) {
      return `${value.length} ${value.length === 1 ? 'item' : 'items'}`
    }
    if (value && typeof value === 'object') {
      return 'Updated'
    }
    return value
  }

  private hasChangedFields(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0
    return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
  }

  private readTextField(value: unknown, fieldNames: string[]): string | undefined {
    const record = this.asPlainRecord(value)
    if (!record) return undefined
    for (const fieldName of fieldNames) {
      const fieldValue = record[fieldName]
      if (typeof fieldValue === 'string' && fieldValue.trim()) {
        return fieldValue.trim()
      }
    }
    return undefined
  }

  private readFirstTextField(values: unknown[], fieldNames: string[]): string | undefined {
    for (const value of values) {
      const result = this.readTextField(value, fieldNames)
      if (result) return result
    }
    return undefined
  }

  private snapshotSourceKey(source: RecordSnapshotSource): string {
    return [source.detailUrl, this.serializeParams(source.detailConfig?.params)].join('|')
  }

  private requestTargetsActiveRecord(config: AxiosRequestConfig): boolean {
    const activeRecord = this.activeRecord()
    return activeRecord ? this.requestTargetsRecord(config, activeRecord) : false
  }

  private requestTargetsRecord(config: AxiosRequestConfig, activeRecord: ActiveRecord): boolean {
    return (
      this.requestPathTargetsRecord(config.url, activeRecord) ||
      this.requestValueTargetsRecord(config.params, activeRecord) ||
      this.requestValueTargetsRecord(config.data, activeRecord)
    )
  }

  private requestPathTargetsRecord(url: string | undefined, activeRecord: ActiveRecord): boolean {
    if (!url) return false
    const path = url.split('?')[0]?.replace(/\/$/, '') ?? ''
    const encodedRecordId = encodeURIComponent(activeRecord.recordId)
    const escapedRecordId = encodedRecordId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns: Record<OptimisticRecordType, RegExp[]> = {
      application: [
        new RegExp(`/lexis/applications/${escapedRecordId}(?:/|$)`, 'i'),
        new RegExp(`/lexis/application-reviews/${escapedRecordId}(?:/|$)`, 'i'),
      ],
      'federal-application': [
        new RegExp(`/lexis/federal/applications/${escapedRecordId}(?:/|$)`, 'i'),
      ],
      exemption: [new RegExp(`/lexis/exemptions/${escapedRecordId}(?:/|$)`, 'i')],
      permit: [new RegExp(`/lexis/permits/${escapedRecordId}(?:/|$)`, 'i')],
      offer: [new RegExp(`/lexis/purchase-offers/${escapedRecordId}(?:/|$)`, 'i')],
    }
    if (patterns[activeRecord.recordType].some((pattern) => pattern.test(path))) {
      return true
    }

    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
    return query ? this.requestValueTargetsRecord(new URLSearchParams(query), activeRecord) : false
  }

  private requestValueTargetsRecord(value: unknown, activeRecord: ActiveRecord): boolean {
    if (value == null) return false
    const identifiers = RECORD_IDENTIFIER_KEYS[activeRecord.recordType]

    if (value instanceof URLSearchParams) {
      return Array.from(value.entries()).some(
        ([key, entry]) =>
          identifiers.has(key.toLowerCase()) &&
          this.recordIdentifierMatches(entry, activeRecord.recordId),
      )
    }
    if (typeof FormData !== 'undefined' && value instanceof FormData) {
      return Array.from(value.entries()).some(
        ([key, entry]) =>
          identifiers.has(key.toLowerCase()) &&
          this.recordIdentifierMatches(entry, activeRecord.recordId),
      )
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return false
      if (trimmed.startsWith('{')) {
        try {
          return this.requestValueTargetsRecord(JSON.parse(trimmed), activeRecord)
        } catch {
          return false
        }
      }
      return this.requestValueTargetsRecord(new URLSearchParams(trimmed), activeRecord)
    }
    if (typeof value !== 'object' || Array.isArray(value)) return false

    return Object.entries(value as Record<string, unknown>).some(
      ([key, entry]) =>
        identifiers.has(key.toLowerCase()) &&
        this.recordIdentifierMatches(entry, activeRecord.recordId),
    )
  }

  private recordIdentifierMatches(value: unknown, recordId: string): boolean {
    if (Array.isArray(value)) {
      return value.some((entry) => this.recordIdentifierMatches(entry, recordId))
    }
    if (typeof value !== 'string' && typeof value !== 'number') return false

    const expected = recordId.trim().toUpperCase()
    return String(value)
      .split(',')
      .some((entry) => entry.trim().toUpperCase() === expected)
  }

  private activeRecord(): ActiveRecord | null {
    const path = window.location.pathname.replace(/\/$/, '')
    const routePatterns: Array<[OptimisticRecordType, RegExp]> = [
      ['application', /^\/provincial\/application\/([^/]+)$/],
      ['federal-application', /^\/federal\/application\/([^/]+)$/],
      ['exemption', /^\/provincial\/exemption\/([^/]+)$/],
      ['permit', /^\/provincial\/permit\/([^/]+)$/],
      ['offer', /^\/provincial\/offers\/([^/]+)$/],
    ]

    for (const [recordType, pattern] of routePatterns) {
      const match = path.match(pattern)
      if (match?.[1]) {
        return { recordType, recordId: decodeURIComponent(match[1]) }
      }
    }
    return null
  }

  private recordVersionKey(recordType: OptimisticRecordType, recordId: string): string {
    return `${recordType}:${recordId.trim()}`
  }

  private toHeaderRecord(headers: unknown): Record<string, unknown> {
    if (!headers || typeof headers !== 'object') {
      return {}
    }

    const accessors = headers as HeaderAccessors
    if (typeof accessors.toJSON === 'function') {
      try {
        return accessors.toJSON()
      } catch {
        return {}
      }
    }

    return Object.entries(headers as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        if (typeof value !== 'function') {
          acc[key] = value
        }
        return acc
      },
      {},
    )
  }

  private serializeParams(params: unknown): string {
    const entries: Array<[string, string]> = []

    const appendValue = (key: string, value: unknown) => {
      if (value === null || value === undefined) {
        return
      }
      if (Array.isArray(value)) {
        value.forEach((item) => appendValue(key, item))
        return
      }
      if (typeof value === 'object') {
        entries.push([key, JSON.stringify(value)])
        return
      }
      entries.push([key, String(value)])
    }

    if (params instanceof URLSearchParams) {
      params.forEach((value, key) => entries.push([key, value]))
    } else if (params && typeof params === 'object') {
      Object.entries(params as Record<string, unknown>).forEach(([key, value]) =>
        appendValue(key, value),
      )
    }

    return entries
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey
          ? leftValue.localeCompare(rightValue)
          : leftKey.localeCompare(rightKey),
      )
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
  }

  private serializeHeaders(headers: unknown): string {
    const acceptHeader = this.getHeader(headers, 'accept')
    if (acceptHeader === undefined || acceptHeader === null) {
      return ''
    }

    return `accept=${this.asCachePart(acceptHeader)}`
  }

  private asCachePart(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
    return ''
  }

  private hashCacheScope(value: string): string {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16)
  }
}

export default new APIService()
