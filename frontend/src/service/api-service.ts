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
    this.client.interceptors.response.use(
      (config) => {
        console.info(`received response status: ${config.status}`)
        return config
      },
      (error) => {
        console.error(error)
        return Promise.reject(error)
      },
    )

    this.client.interceptors.request.use(async (config) => {
      const requestConfig = config

      if ((requestConfig.method ?? 'get').toLowerCase() !== 'get') {
        this.clearCachedGetData()
      }

      try {
        const { tokens } = (await fetchAuthSession()) ?? {}
        const accessToken = tokens?.accessToken?.toString()
        if (accessToken) {
          requestConfig.headers.Authorization = `Bearer ${accessToken}`
        }
      } catch {
        // No active Cognito session yet; continue without bearer token.
      }

      const csrfCookie = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
      if (csrfCookie?.[1]) {
        requestConfig.headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfCookie[1])
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

    const key = await this.buildCacheKey(path, config, options.cacheKey)
    const cacheGeneration = this.cacheGeneration
    const now = Date.now()
    const cachedResponse = this.responseCache.get(key)
    if (cachedResponse && cachedResponse.expiresAt > now) {
      return cachedResponse.response as AxiosResponse<T>
    }

    const inFlightGet = this.inFlightGets.get(key)
    if (inFlightGet) {
      return inFlightGet as Promise<AxiosResponse<T>>
    }

    const request = this.client
      .get<T>(path, config)
      .then((response) => {
        if (this.cacheGeneration === cacheGeneration) {
          this.responseCache.set(key, {
            expiresAt: Date.now() + ttlMs,
            response: response as AxiosResponse<unknown>,
          })
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

  private async buildCacheKey(
    path: string,
    config: AxiosRequestConfig,
    customCacheKey?: string,
  ): Promise<string> {
    const authScope = await this.resolveAuthScope()
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

  private async resolveAuthScope(): Promise<string> {
    try {
      const { tokens } = (await fetchAuthSession()) ?? {}
      const payload = tokens?.accessToken?.payload ?? tokens?.idToken?.payload
      const subject = this.asCachePart(payload?.sub)
      const username = this.asCachePart(payload?.username)
      const identityProvider = this.asCachePart(payload?.identity_provider)
      const clientId = this.asCachePart(payload?.client_id)
      const scopeParts = [subject, username, identityProvider, clientId].filter(Boolean)
      return scopeParts.length > 0 ? scopeParts.join(':') : 'authenticated'
    } catch {
      return 'anonymous'
    }
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
    if (!headers || typeof headers !== 'object') {
      return ''
    }

    const source = headers as Record<string, unknown>
    return Object.entries(source)
      .filter(([key]) => key.toLowerCase() === 'accept')
      .map(([key, value]) => `${key.toLowerCase()}=${this.asCachePart(value)}`)
      .sort()
      .join('&')
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
}

export default new APIService()
