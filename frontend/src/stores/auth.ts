import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('authToken'))
  const user = ref<any>(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value)

  async function login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password })
    if (response.data.success) {
      token.value = response.data.token
      user.value = response.data.user
      localStorage.setItem('authToken', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
    }
    return response.data
  }

  async function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
  }

  async function checkAuth() {
    if (!token.value) return false
    try {
      const response = await api.get('/auth/me')
      if (response.data.success) {
        user.value = response.data.user
        return true
      }
    } catch {
      logout()
    }
    return false
  }

  return { token, user, isAuthenticated, login, logout, checkAuth }
})
