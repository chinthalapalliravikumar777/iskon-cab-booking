import React, { createContext, useContext, useState, useCallback } from 'react'
import type { AuthUser, UserRole } from '../types'

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  login: (user: AuthUser, token: string) => void
  logout: () => void
  hasRole: (role: UserRole) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Restore session from localStorage on page refresh
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('iskon_user')
    return stored ? JSON.parse(stored) : null
  })

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('iskon_token')
  })

  const login = useCallback((userData: AuthUser, accessToken: string) => {
    setUser(userData)
    setToken(accessToken)
    // Persist to localStorage so refresh doesn't log user out
    localStorage.setItem('iskon_user', JSON.stringify(userData))
    localStorage.setItem('iskon_token', accessToken)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('iskon_user')
    localStorage.removeItem('iskon_token')
  }, [])

  const hasRole = useCallback(
    (role: UserRole) => user?.role === role,
    [user]
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        login,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook - throws a clear error if used outside AuthProvider
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
