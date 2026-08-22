import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'
import apiClient from '../../api/client'
import { useEffect, useState } from 'react'

type ManagedRole = 'CGM' | 'DRIVER'
type AccountFilter = 'ALL' | ManagedRole
type CreatedUser = { userId?: string; email: string; name: string; mobile?: string; role: ManagedRole; status?: string; enabled?: boolean }

const StatCard = ({
  icon, label, value, color, sublabel
}: {
  icon: string; label: string; value: string; color: string; sublabel?: string
}) => (
  <div className="card">
    <div className="flex items-start justify-between mb-3">
      <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center text-xl`}>{icon}</div>
    </div>
    <p className="text-3xl font-bold text-gray-900">{value}</p>
    <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
    {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
  </div>
)

const QuickAction = ({ icon, label, description, color }: {
  icon: string; label: string; description: string; color: string
}) => (
  <div className="card-hover flex items-center gap-4">
    <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center text-2xl flex-shrink-0`}>{icon}</div>
    <div>
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{description}</p>
    </div>
    <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </div>
)

export default function AdminDashboard() {
  const { user } = useAuth()
  const [role, setRole] = useState<ManagedRole>('CGM')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([])
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('ALL')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadUsers = async () => {
    try {
      const response = await apiClient.get('/v1/admin/users')
      setCreatedUsers(response.data.data || [])
    } catch {
      setError('Could not load the accounts list.')
    }
  }

  useEffect(() => { void loadUsers() }, [])

  const filteredUsers = accountFilter === 'ALL'
    ? createdUsers
    : createdUsers.filter(created => created.role === accountFilter)

  const createUser = async (details: { email: string; name: string; mobile?: string; password: string; role: ManagedRole }) => {
    const response = await apiClient.post('/v1/admin/users', details)
    return response.data.data as CreatedUser
  }

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const created = await createUser({ email, name, mobile, password, role })
      setCreatedUsers(current => [created, ...current])
      setMessage(`${role} account created with the exact password you provided.`)
      setEmail('')
      setName('')
      setMobile('')
      setPassword('')
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || (requestError.response ? 'The Admin user API rejected this request.' : 'The Admin user API is not deployed or the API URL is not configured.'))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    try {
      await apiClient.patch(`/v1/admin/users/${encodeURIComponent(resetEmail)}/password`, { password: resetPassword })
      setMessage('Password changed successfully. Give the new password only to that user.')
      setResetEmail('')
      setResetPassword('')
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || (requestError.response ? 'The Admin password API rejected this request.' : 'The Admin password API is not deployed or the API URL is not configured.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout title="Admin Dashboard" subtitle={`Logged in as ${user?.name}`}>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon="🚗" label="Total Cabs"      value="7"  color="bg-blue-50"    sublabel="0 available" />
        <StatCard icon="👤" label="Active CGMs"     value="25" color="bg-purple-50"  sublabel="All active" />
        <StatCard icon="🧑‍✈️" label="Drivers"        value="0"  color="bg-emerald-50" sublabel="Add drivers" />
        <StatCard icon="📋" label="Total Bookings"  value="0"  color="bg-orange-50"  sublabel="This month" />
      </div>

      {/* System status banner */}
      <div className="card bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 text-white mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-bold text-lg">System Status</h3>
            <p className="text-blue-100 text-sm mt-1">All services are operational</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/30 border border-emerald-400/40 px-4 py-2 rounded-xl">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-white text-sm font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6">
        <p className="section-title mb-3">Quick Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickAction icon="🚗" label="Manage Cabs"    description="Add, edit or update cab status" color="bg-blue-50" />
          <QuickAction icon="🧑‍✈️" label="Manage Drivers" description="Add or edit driver profiles"    color="bg-emerald-50" />
          <QuickAction icon="👥" label="Manage CGMs"    description="Add or deactivate CGM accounts"  color="bg-purple-50" />
          <QuickAction icon="📋" label="All Bookings"   description="View, cancel or reassign trips"   color="bg-orange-50" />
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <p className="section-title">Manage CGM and Driver accounts</p>
            <p className="section-subtitle">Create a login ID and temporary password. Users set their permanent password at first sign-in.</p>
          </div>
        </div>

        {message && <div className="alert-success mb-4">{message}</div>}
        {error && <div className="alert-error mb-4">{error}</div>}

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="input-label" htmlFor="user-role">Role</label>
            <select id="user-role" value={role} onChange={event => setRole(event.target.value as ManagedRole)} className="input-field">
              <option value="CGM">CGM</option>
              <option value="DRIVER">Driver</option>
            </select>
          </div>
          <div>
            <label className="input-label" htmlFor="user-email">Login email</label>
            <input id="user-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} className="input-field" placeholder="person@iskon.in" />
          </div>
          <div>
            <label className="input-label" htmlFor="user-name">Full name</label>
            <input id="user-name" required value={name} onChange={event => setName(event.target.value)} className="input-field" placeholder="Full name" />
          </div>
          <div>
            <label className="input-label" htmlFor="user-mobile">Mobile</label>
            <input id="user-mobile" value={mobile} onChange={event => setMobile(event.target.value)} className="input-field" placeholder="Mobile number" />
          </div>
          <div>
            <label className="input-label" htmlFor="user-password">Password</label>
            <input id="user-password" type="password" required value={password} onChange={event => setPassword(event.target.value)} className="input-field" placeholder="Exact password" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">Create account</button>
        </form>
      </div>

      <div className="card mb-6">
        <p className="section-title">Change a user password</p>
        <p className="section-subtitle mb-4">Only an Admin can change passwords. Enter the exact login ID given to the CGM or Driver.</p>
        <form onSubmit={handleResetPassword} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="input-label" htmlFor="reset-email">User login ID</label>
            <input id="reset-email" type="email" required value={resetEmail} onChange={event => setResetEmail(event.target.value)} className="input-field" placeholder="person@iskon.in" />
          </div>
          <div>
            <label className="input-label" htmlFor="reset-password">New password</label>
            <input id="reset-password" type="password" required value={resetPassword} onChange={event => setResetPassword(event.target.value)} className="input-field" placeholder="New exact password" />
          </div>
          <button type="submit" disabled={loading} className="btn-secondary">Change password</button>
        </form>
      </div>

      {createdUsers.length > 0 && (
        <div className="card mb-6 overflow-x-auto">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <p className="section-title">New account credentials</p>
              <p className="section-subtitle">Accounts created in Cognito. Passwords are never stored or displayed by this panel.</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1" aria-label="Filter accounts by role">
              {(['ALL', 'CGM', 'DRIVER'] as AccountFilter[]).map(filter => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setAccountFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${accountFilter === filter ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {filter === 'ALL' ? 'All' : filter === 'DRIVER' ? 'Drivers' : 'CGMs'}
                </button>
              ))}
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-gray-100 text-gray-500"><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Login ID</th><th className="py-2 pr-4">Mobile</th><th className="py-2">Status</th></tr></thead>
            <tbody>{filteredUsers.map(created => <tr key={`${created.role}-${created.email}`} className="border-b border-gray-50"><td className="py-2 pr-4"><span className={`badge-${created.role.toLowerCase()}`}>{created.role}</span></td><td className="py-2 pr-4">{created.name}</td><td className="py-2 pr-4">{created.email}</td><td className="py-2 pr-4">{created.mobile || '-'}</td><td className="py-2">{created.enabled === false ? 'Disabled' : created.status === 'FORCE_CHANGE_PASSWORD' ? 'Password setup pending' : 'Active'}</td></tr>)}</tbody>
          </table>
          {filteredUsers.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No accounts found for this filter.</p>}
        </div>
      )}

      {/* Recent activity placeholder */}
      <div className="card">
        <div className="mb-4">
          <p className="section-title">Recent Activity</p>
          <p className="section-subtitle">Latest bookings and changes</p>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">📊</div>
          <p className="font-medium text-gray-700">No activity yet</p>
          <p className="text-sm text-gray-400 mt-1">Activity will appear here as bookings are made</p>
        </div>
      </div>

    </AppLayout>
  )
}
