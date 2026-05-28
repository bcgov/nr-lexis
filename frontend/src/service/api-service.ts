import type { AxiosInstance } from 'axios'
import axios from 'axios'
import { getDevRolesHeaderValue } from '@/context/auth/dev-role-storage'

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
    this.client.interceptors.request.use((config) => {
      const roleHeader = getDevRolesHeaderValue()
      if (roleHeader) {
        config.headers['X-Lexis-Roles'] = roleHeader
      } else {
        delete config.headers['X-Lexis-Roles']
      }
      return config
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
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client
  }
}

export default new APIService()
