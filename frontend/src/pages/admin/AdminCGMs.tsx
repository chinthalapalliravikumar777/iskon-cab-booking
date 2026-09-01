import { useEffect, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import apiClient from '../../api/client'

interface CGMUser {
  userId: string
  email: string
  name: string
  mobile: string
  role: string
  status: string
  enabled: boolean
}

interface Booking {
  bookingId: string
  cabNumber: string
  bookingDate: string
  startTime?: string
  endTime?: string
  timeSlot: string
  projectName?: string
  siteLocation: string
  bookingStatus: string
}

const statusBadge = (enabled: boolean) =>
  enabled
    ? 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800'
    : 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700'

const bookingStatusColor: Record<string, string> = {
  BOOKING_PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED:       'bg-blue-100 text-blue-800',
  ACCEPTED:        'bg-blue-100 text-blue-800',
  ON_THE_WAY:      'bg-orange-100 text-orange-800',
  ON_SITE:         'bg-purple-100 text-purple-800',
  COMPLETED:       'bg-emerald-100 text-emerald-800',
  CANCELLED:       'bg-red-100 text-red-700',
  REJECTED:        'bg-red-100 text-red-700',
  EXPIRED:         'bg-gray-100 text-gray-600',
}

export default function AdminCGMs() {
  const [cgms, setCgms] = useState<CGMUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [historyUser, setHistoryUser] = useState<CGMUser | null>(null)
  const [history, setHistory] = useState<Booking[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/v1/admin/users')
      const all: CGMUser[] = res.data.data || []
      setCgms(all.filter(u => u.role === 'CGM'))
    } catch {
      setError('Could not load CGMs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const toggleStatus = async (cgm: CGMUser) => {
    setMessage(''); setError('')
    try {
      await apiClient.patch(`/v1/admin/users/${encodeURIComponent(cgm.email)}/status`, {
        enabled: !cgm.enabled,
      })
      setCgms(prev => prev.map(c => c.userId === cgm.userId ? { ...c, enabled: !c.enabled } : c))
      setMessage(`${cgm.name} has been ${!cgm.enabled ? 'enabled' : 'disabled'}.`)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not update CGM status.')
    }
  }

  const viewHistory = async (cgm: CGMUser) => {
    setHistoryUser(cgm)
    setHistoryLoading(true); setHistory([])
    try {
      const res = await apiClient.get('/v1/admin/bookings', { params: { cgmId: cgm.userId } })
      setHistory(res.data.data || [])
    } catch {
      setError('Could not load booking history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const filtered = cgms.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile?.includes(search)
  )

  return (
    <AppLayout title="Manage CGMs" subtitle="View and manage CGM accounts and booking history">
      {message && <div className="alert-success mb-4">{message}</div>}
      {error   && <div className="alert-error mb-4">{error}</div>}

      <div className="card mb-4">
        <input
          className="input-field"
          placeholder="Search by name, email or mobile..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-4">
          <p className="section-title">All CGMs</p>
          <p className="section-subtitle">{cgms.length} CGM account{cgms.length !== 1 ? 's' : ''}</p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading CGMs...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">👥</div>
            <p className="font-medium text-gray-700">No CGMs found</p>
            <p className="text-sm text-gray-400 mt-1">Create CGM accounts from the Dashboard</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Mobile</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(cgm => (
                <tr key={cgm.userId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-900">{cgm.name}</td>
                  <td className="py-3 pr-4 text-gray-600">{cgm.email}</td>
                  <td className="py-3 pr-4 text-gray-600">{cgm.mobile || '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={statusBadge(cgm.enabled)}>
                      {cgm.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50"
                        onClick={() => void viewHistory(cgm)}
                      >
                        View Bookings
                      </button>
                      <button
                        className={`text-xs font-medium px-2 py-1 rounded-lg ${cgm.enabled ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                        onClick={() => void toggleStatus(cgm)}
                      >
                        {cgm.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Booking History Modal */}
      {historyUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Booking History</h2>
                <p className="text-sm text-gray-500">{historyUser.name}</p>
              </div>
              <button
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                onClick={() => setHistoryUser(null)}
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : history.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No bookings found</div>
              ) : (
                <div className="space-y-3">
                  {history.map(b => (
                    <div key={b.bookingId} className="rounded-xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{b.projectName || b.siteLocation}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {b.bookingDate} · {b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : b.timeSlot} · {b.cabNumber}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${bookingStatusColor[b.bookingStatus] || 'bg-gray-100 text-gray-600'}`}>
                        {b.bookingStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
