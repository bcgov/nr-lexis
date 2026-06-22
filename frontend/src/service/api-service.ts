import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'

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

type HeaderAccessors = {
  get?: (name: string) => unknown
  has?: (name: string) => boolean
  set?: (name: string, value: string) => void
  toJSON?: () => Record<string, unknown>
}

const RESPONSE_CACHE_MAX_ENTRIES = 150

class APIService {
  private readonly client: AxiosInstance
  private readonly responseCache = new Map<string, CachedResponse>()
  private readonly inFlightGets = new Map<string, Promise<AxiosResponse<unknown>>>()
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

      if ((requestConfig.method ?? 'get').toLowerCase() !== 'get') {
        this.clearCachedGetData()
      }

      if (!this.hasHeader(requestConfig.headers, 'authorization')) {
        try {
          const { tokens } = (await fetchAuthSession()) ?? {}
          const accessToken = tokens?.accessToken?.toString()
          if (accessToken) {
            this.setHeader(requestConfig.headers, 'Authorization', `Bearer ${accessToken}`)
          }
        } catch {
          // No active Cognito session yet; continue without bearer token.
        }
      }

      const csrfCookie = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
      if (csrfCookie?.[1]) {
        this.setHeader(requestConfig.headers, 'X-XSRF-TOKEN', decodeURIComponent(csrfCookie[1]))
      }

      return requestConfig
    })
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client
  }

  public clearCachedGetData(): void {
    this.cacheGeneration += 1
    this.responseCache.clear()
    this.inFlightGets.clear()
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
      const scopeParts = [subject, username, identityProvider, clientId].filter(Boolean)
      return {
        cacheScope:
          scopeParts.length > 0
            ? scopeParts.join(':')
            : accessToken
              ? `token:${this.hashCacheScope(accessToken)}`
              : 'anonymous',
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
