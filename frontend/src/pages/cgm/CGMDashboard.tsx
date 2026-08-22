import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'
import apiClient from '../../api/client'
import { useEffect, useState } from 'react'

type Booking = { bookingId: string; cabNumber: string; driverName: string; driverMobile?: string; bookingDate: string; startTime?: string; endTime?: string; timeSlot: string; projectName?: string; siteLocation: string; bookingStatus: string }

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

  useEffect(() => {
    apiClient.get('/v1/cgm/bookings').then(response => setBookings(response.data.data || [])).catch(() => setError('Could not load your bookings.')).finally(() => setLoading(false))
  }, [])

  const active = bookings.filter(booking => !['COMPLETED', 'CANCELLED'].includes(booking.bookingStatus))
  const completed = bookings.filter(booking => booking.bookingStatus === 'COMPLETED')
  const cancelled = bookings.filter(booking => booking.bookingStatus === 'CANCELLED')

  return (
    <AppLayout title="My Dashboard" subtitle={`Welcome back, ${user?.name}`}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon="🚗" label="Active Bookings"  value={String(active.length)} color="bg-blue-50" />
        <StatCard icon="✅" label="Completed Trips"  value={String(completed.length)} color="bg-emerald-50" />
        <StatCard icon="❌" label="Cancelled"        value={String(cancelled.length)} color="bg-red-50" />
      </div>

      {/* Quick action */}
      <div className="card bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 text-white mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold mb-1">Book a Cab</h3>
            <p className="text-blue-100 text-sm">Schedule your next site visit quickly</p>
          </div>
          <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center text-3xl">🚕</div>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors
                        px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer">
          Book a Cab →
        </div>
      </div>

      {/* Recent bookings placeholder */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-title">Recent Bookings</p>
            <p className="section-subtitle">Your latest cab bookings</p>
          </div>
        </div>
        {error && <div className="alert-error mb-4">{error}</div>}
        {loading ? <div className="py-12 text-center text-sm text-gray-400">Loading your bookings...</div> : bookings.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-center"><div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">📋</div><p className="font-medium text-gray-700">No bookings yet</p><p className="text-sm text-gray-400 mt-1">Your confirmed site visits will appear here</p></div> : <div className="space-y-3">{bookings.slice(0, 5).map(booking => <div key={booking.bookingId} className="rounded-xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-gray-900">{booking.projectName || booking.siteLocation}</p><p className="text-sm text-gray-500">{booking.bookingDate} · {booking.startTime && booking.endTime ? `${booking.startTime}–${booking.endTime}` : booking.timeSlot} · {booking.cabNumber}</p><p className="text-xs text-gray-400 mt-1">Driver: {booking.driverName}</p></div><span className="badge-booked">{booking.bookingStatus}</span></div>)}</div>}
      </div>
    </AppLayout>
  )
}
