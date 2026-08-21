import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { logout as cognitoLogout } from '../../utils/cognito'

interface AppLayoutProps {
  children: React.ReactNode
  title: string
}

/**
 * Shared layout for CGM, Driver and Admin dashboards.
 * Shows a top navbar with the user's name, role badge, and a logout button.
 */
export default function AppLayout({ children, title }: AppLayoutProps) {
  const { user, logout: clearSession } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    cognitoLogout()       // Sign out from Cognito
    clearSession()        // Clear AuthContext + localStorage
    navigate('/login', { replace: true })
  }

  // Role badge colors
  const roleBadge: Record<string, string> = {
    ADMIN: 'bg-purple-100 text-purple-700',
    CGM: 'bg-blue-100 text-blue-700',
    DRIVER: 'bg-green-100 text-green-700',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top navigation bar */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <span className="font-semibold text-gray-800 text-sm">Iskon Cab Booking</span>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <span className="text-sm text-gray-600 hidden sm:block">{user.name}</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${roleBadge[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {user.role}
                </span>
              </>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">{title}</h1>
        {children}
      </main>
    </div>
  )
}
