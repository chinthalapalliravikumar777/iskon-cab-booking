import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'
import apiClient from '../../api/client'
import BookingForm from '../../components/cgm/BookingForm'
import NotificationToast, { ToastMessage } from '../../components/common/NotificationToast'
import { useWebSocket } from '../../hooks/useWebSocket'

interface Booking {
  bookingId: string
  cabNumber: string
  driverName: string
  driverMobile?: string
  bookingDate: string
  startTime?: string
  endTime?: string
  timeSlot: string
  projectName?: string
  siteLocation: string
  bookingStatus: string
  status?: string
}

const STATUS_COLORS: Record<string, string> = {
  BOOKING_PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED:       'bg-blue-100 text-blue-800',
  ACCEPTED:        'bg-blue-100 text-blue-700',
  ON_THE_WAY:      'bg-orange-100 text-orange-800',
  ON_SITE:         'bg-purple-100 text-purple-800',
  COMPLETED:       'bg-emerald-100 text-emerald-800',
  CANCELLED:       'bg-red-100 text-red-700',
  REJECTED:        'bg-red-100 text-red-700',
  EXPIRED:         'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  BOOKING_PENDING: 'Awaiting Driver',
  CONFIRMED:       'Confirmed',
  ACCEPTED:        'Accepted',
  ON_THE_WAY:      'Driver En Route',
  ON_SITE:         'Driver at Site',
  COMPLETED:       'Completed',
  CANCELLED:       'Cancelled',
  REJECTED:        'Rejected',
  EXPIRED:         'Expired',
}

const ACTIVE_STATUSES = ['BOOKING_PENDING', 'CONFIRMED', 'ACCEPTED', 'ON_THE_WAY', 'ON_SITE']

const StatCard = ({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) => (
  <div className="card flex items-center gap-4">
    <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center text-2xl flex-shrink-0`}>
      {icon}
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  </div>
)

export default function CGMDashboard() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const loadBookings = () =>
    apiClient.get('/v1/cgm/bookings')
      .then(r => setBookings(r.data.data || []))
      .catch(() => setError('Could not load your bookings.'))
      .finally(() => setLoading(false))

  useEffect(() => { void loadBookings() }, [])

  // WebSocket — receive real-time trip status updates
  const handleWsMessage = useCallback((type: string, payload: Record<string, unknown>) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, type, text: type, at: Date.now(), payload }])

    // Refresh booking list when trip status changes
    const refreshTypes = ['DRIVER_ACCEPTED', 'DRIVER_ON_THE_WAY', 'DRIVER_ARRIVED', 'TRIP_COMPLETED', 'BOOKING_EXPIRED', 'BOOKING_CANCELLED_ADMIN']
    if (refreshTypes.includes(type)) {
      void loadBookings()
    }
    void payload // used by broadcast
  }, [])

  useWebSocket(handleWsMessage)

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const getStatus = (b: Booking) => b.bookingStatus || b.status || ''
  const active    = bookings.filter(b => ACTIVE_STATUSES.includes(getStatus(b)))
  const completed = bookings.filter(b => getStatus(b) === 'COMPLETED')
  const cancelled = bookings.filter(b => ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(getStatus(b)))

  return (
    <AppLayout title="My Dashboard" subtitle={`Welcome back, ${user?.name}`}>
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon="🚗" label="Active Bookings" value={String(active.length)}    color="bg-blue-50" />
        <StatCard icon="✅" label="Completed Trips" value={String(completed.length)} color="bg-emerald-50" />
        <StatCard icon="❌" label="Cancelled"        value={String(cancelled.length)} color="bg-red-50" />
      </div>

      {/* Book a cab CTA */}
      <div className="card bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 text-white mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold mb-1">Book a Cab</h3>
            <p className="text-blue-100 text-sm">Schedule your next site visit</p>
          </div>
          <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center text-3xl">🚕</div>
        </div>
        <BookingForm onBooked={loadBookings} />
      </div>

      {/* Active bookings — show driver contact if available */}
      {active.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-title">Active Bookings</p>
              <p className="section-subtitle">{active.length} in progress</p>
            </div>
          </div>
          <div className="space-y-3">
            {active.map(b => {
              const status = getStatus(b)
              const hasDriver = b.driverMobile && ['ACCEPTED', 'ON_THE_WAY', 'ON_SITE', 'CONFIRMED'].includes(status)
              return (
                <div key={b.bookingId} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{b.projectName || b.siteLocation}</p>
                      <p className="text-sm text-gray-500">
                        {b.bookingDate} · {b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : b.timeSlot} · {b.cabNumber}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Driver: {b.driverName}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  </div>
                  {hasDriver && (
                    <div className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2 mt-2">
                      <div>
                        <p className="text-xs text-blue-600 font-medium">Driver Mobile</p>
                        <p className="text-sm font-bold text-blue-900">{b.driverMobile}</p>
                      </div>
                      <a
                        href={`tel:${b.driverMobile}`}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-xl"
                      >
                        📞 Call
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent history */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-title">Recent Bookings</p>
            <p className="section-subtitle">Your latest cab bookings</p>
          </div>
          <Link to="/cgm/history" className="text-sm text-blue-600 font-medium hover:text-blue-800">
            View all →
          </Link>
        </div>
        {error && <div className="alert-error mb-4">{error}</div>}
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">📋</div>
            <p className="font-medium text-gray-700">No bookings yet</p>
            <p className="text-sm text-gray-400 mt-1">Book your first site visit above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.slice(0, 5).map(b => {
              const status = getStatus(b)
              return (
                <div key={b.bookingId} className="rounded-xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{b.projectName || b.siteLocation}</p>
                    <p className="text-sm text-gray-500">
                      {b.bookingDate} · {b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : b.timeSlot} · {b.cabNumber}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Driver: {b.driverName}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[status] || status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
