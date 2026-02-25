import axios from 'axios'

const resolveDefaultApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }
  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || resolveDefaultApiBaseUrl()).replace(/\/+$/, '')
let csrfToken = null

export const setCsrfToken = (token) => {
  csrfToken = token || null
}

const getCookie = (name) => {
  const cookies = document.cookie ? document.cookie.split('; ') : []
  const prefix = `${name}=`
  for (const cookie of cookies) {
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length))
    }
  }
  return null
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const token = csrfToken || getCookie('csrftoken')
    if (token) {
      config.headers = config.headers || {}
      config.headers['X-CSRFToken'] = token
    }
  }
  return config
})

export default api
