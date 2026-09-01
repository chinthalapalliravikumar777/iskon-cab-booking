import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { login, completeNewPassword } from '../../utils/cognito'
import type { CognitoUser } from 'amazon-cognito-identity-js'

type Screen = 'login' | 'new-password'

// ── Icons ────────────────────────────────────────────────────────────────────
const CarIcon = () => (
  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM3 9l1.5-6h15L21 9M3 9h18M3 9l-1 4h20l-1-4" />
  </svg>
)
const LockIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
)
const MailIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const AlertIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
)

// ── Feature list for the left panel ──────────────────────────────────────────
const features = [
  { icon: '🚗', text: 'Book cabs for site visits instantly' },
  { icon: '📍', text: 'Track your driver in real time' },
  { icon: '📱', text: 'Get driver contact on confirmation' },
  { icon: '🔒', text: 'Secure role-based access for all users' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { login: saveSession, isAuthenticated, user } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [screen, setScreen] = useState<Screen>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [pendingCognitoUser, setPendingCognitoUser] = useState<CognitoUser | null>(null)
  const [pendingUserAttributes, setPendingUserAttributes] = useState<Record<string, string>>({})

  if (isAuthenticated && user) {
    const dest = user.role === 'ADMIN' ? '/admin' : user.role === 'DRIVER' ? '/driver' : '/cgm'
    navigate(dest, { replace: true })
    return null
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email.trim().toLowerCase(), password)
    setLoading(false)
    if (result.success) {
      saveSession(result.user, result.token)
      navigate(result.user.role === 'ADMIN' ? '/admin' : result.user.role === 'DRIVER' ? '/driver' : '/cgm', { replace: true })
    } else if (result.requiresPasswordChange) {
      setPendingCognitoUser(result.cognitoUser)
      setPendingUserAttributes(result.userAttributes)
      setScreen('new-password')
    } else {
      setError(result.message)
    }
  }

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!pendingCognitoUser) return
    setLoading(true)
    const result = await completeNewPassword(pendingCognitoUser, newPassword, pendingUserAttributes)
    setLoading(false)
    if (result.success) {
      saveSession(result.user, result.token)
      navigate(result.user.role === 'ADMIN' ? '/admin' : result.user.role === 'DRIVER' ? '/driver' : '/cgm', { replace: true })
    } else {
      setError(result.message)
    }
  }

  // Password strength indicator
  const getStrength = (p: string) => {
    let s = 0
    if (p.length >= 8) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    return s
  }
  const strength = getStrength(newPassword)
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const strengthColor = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-emerald-500'][strength]

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — branding ── */}
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white opacity-5" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white opacity-5" />
        <div className="absolute top-1/2 right-0 w-64 h-64 rounded-full bg-blue-400 opacity-10 -translate-y-1/2 translate-x-1/2" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
              <CarIcon />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Iskon Cab Booking</h1>
              <p className="text-blue-200 text-xs">Developers and Builders</p>
            </div>
          </div>

          <h2 className="text-white text-3xl font-bold leading-snug mb-4">
            Simplify your<br />
            <span className="text-blue-200">site visit logistics</span>
          </h2>
          <p className="text-blue-100 text-sm leading-relaxed max-w-xs">
            Book cabs, track drivers, and manage all site visits from one
            secure internal platform.
          </p>
        </div>

        {/* Feature list */}
        <div className="relative z-10 space-y-3">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
              <span className="text-xl">{f.icon}</span>
              <span className="text-white text-sm font-medium">{f.text}</span>
            </div>
          ))}
        </div>

        {/* Bottom label */}
        <div className="relative z-10">
          <p className="text-blue-200 text-xs">Internal use only &mdash; Authorized personnel</p>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 justify-center mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <CarIcon />
            </div>
            <div>
              <p className="font-bold text-gray-900">Iskon Cab Booking</p>
              <p className="text-xs text-gray-500">Developers and Builders</p>
            </div>
          </div>

          {/* ── LOGIN FORM ── */}
          {screen === 'login' && (
            <div>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
                <p className="text-gray-500 text-sm mt-1">Sign in to access your dashboard</p>
              </div>

              {error && (
                <div className="alert-error mb-5">
                  <AlertIcon />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="input-label" htmlFor="email">Email address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <MailIcon />
                    </div>
                    <input
                      id="email" type="email" required autoComplete="email"
                      value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@iskon.in"
                      className="input-field pl-11"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label className="input-label" htmlFor="password">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <LockIcon />
                    </div>
                    <input
                      id="password" type={showPassword ? 'text' : 'password'} required
                      autoComplete="current-password"
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="input-field pl-11 pr-11"
                      disabled={loading}
                    />
                    <button type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600">
                      {showPassword
                        ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                        : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary">
                  {loading
                    ? <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Signing in...
                      </span>
                    : 'Sign in'
                  }
                </button>
              </form>
            </div>
          )}

          {/* ── NEW PASSWORD FORM ── */}
          {screen === 'new-password' && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Set your password</h2>
                <p className="text-gray-500 text-sm mt-1">
                  This is your first login. Please set a permanent password.
                </p>
              </div>

              {error && (
                <div className="alert-error mb-5">
                  <AlertIcon /><span>{error}</span>
                </div>
              )}

              <form onSubmit={handleNewPassword} className="space-y-5">
                <div>
                  <label className="input-label" htmlFor="new-password">New password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <LockIcon />
                    </div>
                    <input
                      id="new-password" type="password" required autoComplete="new-password"
                      value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="input-field pl-11"
                      disabled={loading}
                    />
                  </div>
                  {/* Strength meter */}
                  {newPassword && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[1,2,3,4].map(i => (
                          <div key={i}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColor : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">Strength: <span className="font-medium">{strengthLabel}</span></p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="input-label" htmlFor="confirm-password">Confirm password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <LockIcon />
                    </div>
                    <input
                      id="confirm-password" type="password" required autoComplete="new-password"
                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      className="input-field pl-11"
                      disabled={loading}
                    />
                    {confirmPassword && newPassword === confirmPassword && (
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                        <span className="text-emerald-500"><CheckIcon /></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Requirements checklist */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {[
                    { ok: newPassword.length >= 8, label: 'At least 8 characters' },
                    { ok: /[A-Z]/.test(newPassword), label: 'One uppercase letter' },
                    { ok: /[a-z]/.test(newPassword), label: 'One lowercase letter' },
                    { ok: /[0-9]/.test(newPassword), label: 'One number' },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${req.ok ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                        {req.ok && <span className="text-white"><CheckIcon /></span>}
                      </div>
                      <span className={`text-xs transition-colors ${req.ok ? 'text-emerald-700 font-medium' : 'text-gray-500'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>

                <button type="submit" disabled={loading} className="btn-primary">
                  {loading
                    ? <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Setting password...
                      </span>
                    : 'Set password and sign in'
                  }
                </button>

                <button type="button" onClick={() => { setScreen('login'); setError('') }}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-2">
                  ← Back to login
                </button>
              </form>
            </div>
          )}

          <p className="text-center text-xs text-gray-400 mt-10">
            &copy; {new Date().getFullYear()} Iskon Developers and Builders. Internal system.
          </p>
        </div>
      </div>
    </div>
  )
}
