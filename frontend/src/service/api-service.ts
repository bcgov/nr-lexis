import type { AxiosInstance } from 'axios'
import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'

class APIService {
  private readonly client: AxiosInstance

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
}

export default new APIService()
