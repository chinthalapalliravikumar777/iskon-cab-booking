import axios from 'axios'
import { getCurrentSession } from '../utils/cognito'

/**
 * Axios instance pre-configured with the API base URL.
 * An interceptor automatically adds the Cognito JWT token
 * to every request so protected APIs work without manual token passing.
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach the current JWT token to every API call
apiClient.interceptors.request.use(async (config) => {
  try {
    const session = await getCurrentSession()
    if (session) {
      const token = session.getIdToken().getJwtToken()
      config.headers['Authorization'] = `Bearer ${token}`
    }
  } catch {
    // If we can't get a session, proceed without a token
    // The API will return 401 and the UI will redirect to login
  }
  return config
})

// Response interceptor: handle 401 (expired session) globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear stored session and redirect to login
      localStorage.removeItem('iskon_user')
      localStorage.removeItem('iskon_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
