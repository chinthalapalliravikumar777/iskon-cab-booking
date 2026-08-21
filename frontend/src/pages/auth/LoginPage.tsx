import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { login, completeNewPassword } from '../../utils/cognito'
import type { CognitoUser } from 'amazon-cognito-identity-js'

// Which screen to show
type Screen = 'login' | 'new-password'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login: saveSession, isAuthenticated, user } = useAuth()

  // Form fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // UI state
  const [screen, setScreen] = useState<Screen>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Stored temporarily during the new-password challenge
  const [pendingCognitoUser, setPendingCognitoUser] = useState<CognitoUser | null>(null)
  const [pendingUserAttributes, setPendingUserAttributes] = useState<Record<string, string>>({})

  // If already logged in, redirect to the correct dashboard
  if (isAuthenticated && user) {
    const dest = user.role === 'ADMIN' ? '/admin' : user.role === 'DRIVER' ? '/driver' : '/cgm'
    navigate(dest, { replace: true })
    return null
  }

  // ── Handle normal login ──────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email.trim().toLowerCase(), password)
    setLoading(false)

    if (result.success) {
      // Save to AuthContext and localStorage, then redirect by role
      saveSession(result.user, result.token)
      const dest = result.user.role === 'ADMIN' ? '/admin' : result.user.role === 'DRIVER' ? '/driver' : '/cgm'
      navigate(dest, { replace: true })
    } else if (result.requiresPasswordChange) {
      // First-time login — Cognito requires a new permanent password
      setPendingCognitoUser(result.cognitoUser)
      setPendingUserAttributes(result.userAttributes)
      setScreen('new-password')
    } else {
      setError(result.message)
    }
  }

  // ── Handle new password submission ───────────────────────────────────────
  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (!pendingCognitoUser) return

    setLoading(true)
    const result = await completeNewPassword(pendingCognitoUser, newPassword, pendingUserAttributes)
    setLoading(false)

    if (result.success) {
      saveSession(result.user, result.token)
      const dest = result.user.role === 'ADMIN' ? '/admin' : result.user.role === 'DRIVER' ? '/driver' : '/cgm'
      navigate(dest, { replace: true })
    } else {
      setError(result.message)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">

        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Iskon Cab Booking</h1>
          <p className="text-sm text-gray-500 mt-1">Iskon Developers and Builders</p>
        </div>

        {/* ── Login Form ── */}
        {screen === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-700 text-center">Sign in to your account</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@iskon.in"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-gray-50"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-gray-50"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold
                         py-2.5 rounded-lg text-sm transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        {/* ── New Password Required Form ── */}
        {screen === 'new-password' && (
          <form onSubmit={handleNewPassword} className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-700">Set your password</h2>
              <p className="text-sm text-gray-500 mt-1">
                Welcome! Please set a permanent password to continue.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li>At least 8 characters</li>
              <li>Include uppercase and lowercase letters</li>
              <li>Include at least one number</li>
            </ul>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold
                         py-2.5 rounded-lg text-sm transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Setting password...' : 'Set password and sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setScreen('login'); setError('') }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Back to login
            </button>
          </form>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Internal system. Authorized users only.
        </p>
      </div>
    </div>
  )
}
