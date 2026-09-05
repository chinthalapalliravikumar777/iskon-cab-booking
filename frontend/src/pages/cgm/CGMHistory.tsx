import { useEffect, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import apiClient from '../../api/client'

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
  projectLocation?: string
  siteLocation: string
  pickupDetails?: string
  bookingStatus: string
  status?: string
  createdAt: string
  confirmationDeadline?: string
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
  CONFIRMED:       'Driver Confirmed',
  ACCEPTED:        'Accepted',
  ON_THE_WAY:      'Driver En Route',
  ON_SITE:         'Driver at Site',
  COMPLETED:       'Completed',
  CANCELLED:       'Cancelled',
  REJECTED:        'Rejected',
  EXPIRED:         'Expired',
}

const ACTIVE_STATUSES = ['BOOKING_PENDING', 'CONFIRMED', 'ACCEPTED', 'ON_THE_WAY', 'ON_SITE']

export default function CGMHistory() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')

  const loadBookings = () => {
    setLoading(true)
    setError('')
    return apiClient.get('/v1/cgm/bookings')
      .then(r => setBookings(r.data.data || []))
      .catch(() => setError('Unable to load bookings. Please try again.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { void loadBookings() }, [])

  const getStatus = (b: Booking) => b.bookingStatus || b.status || 'UNKNOWN'

  const filtered = filterStatus === 'ALL'
    ? bookings
    : filterStatus === 'ACTIVE'
    ? bookings.filter(b => ACTIVE_STATUSES.includes(getStatus(b)))
    : bookings.filter(b => getStatus(b) === filterStatus)

  return (
    <AppLayout title="Booking History" subtitle="All your cab booking requests">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 mb-6 w-fit">
        {[
          { value: 'ALL', label: 'All' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'CANCELLED', label: 'Cancelled' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'EXPIRED', label: 'Expired' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilterStatus(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === tab.value
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="alert-error mb-4"><span className="flex-1">{error}</span><button type="button" className="font-semibold underline" onClick={() => void loadBookings()}>Retry</button></div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading bookings...</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">📋</div>
          <p className="font-medium text-gray-700">No bookings found</p>
          <p className="text-sm text-gray-400 mt-1">Your booking history will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(booking => {
            const status = getStatus(booking)
            const isActive = ACTIVE_STATUSES.includes(status)
            const hasDriver = booking.driverMobile && booking.driverMobile !== '' && isActive

            return (
              <div key={booking.bookingId} className="card">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {booking.projectName || booking.siteLocation}
                    </p>
                    {booking.projectLocation && booking.projectLocation !== booking.siteLocation && (
                      <p className="text-xs text-gray-400 mt-0.5">📍 {booking.projectLocation}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[status] || status}
                  </span>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Date</p>
                    <p className="font-medium text-gray-800">{booking.bookingDate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Time</p>
                    <p className="font-medium text-gray-800">
                      {booking.startTime && booking.endTime
                        ? `${booking.startTime} – ${booking.endTime}`
                        : booking.timeSlot}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cab</p>
                    <p className="font-medium text-gray-800">{booking.cabNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Driver</p>
                    <p className="font-medium text-gray-800">{booking.driverName}</p>
                  </div>
                  {booking.pickupDetails && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400">Pickup Notes</p>
                      <p className="font-medium text-gray-800">{booking.pickupDetails}</p>
                    </div>
                  )}
                </div>

                {/* Driver contact — only shown for active bookings with mobile */}
                {hasDriver && (
                  <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 mt-2">
                    <div>
                      <p className="text-xs text-blue-600 font-medium">Driver Contact</p>
                      <p className="text-sm font-bold text-blue-900">{booking.driverMobile}</p>
                    </div>
                    <a
                      href={`tel:${booking.driverMobile}`}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      📞 Call Driver
                    </a>
                  </div>
                )}

                {/* Pending info */}
                {status === 'BOOKING_PENDING' && booking.confirmationDeadline && (
                  <p className="text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2 mt-2">
                    ⏳ Driver must confirm by {new Date(booking.confirmationDeadline).toLocaleString()}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
