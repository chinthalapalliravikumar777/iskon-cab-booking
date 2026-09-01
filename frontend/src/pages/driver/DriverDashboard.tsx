import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'
import apiClient from '../../api/client'
import { useCallback, useEffect, useState } from 'react'
import DriverNotifications from '../../components/driver/DriverNotifications'
import NotificationToast, { ToastMessage } from '../../components/common/NotificationToast'
import { useWebSocket } from '../../hooks/useWebSocket'

interface Trip {
  bookingId: string
  cgmName: string
  cgmMobile?: string
  cabId: string
  cabNumber: string
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
}

interface CabDetails {
  cabId: string
  cabNumber: string
  vehicleModel: string
  registrationNumber: string
  vehicleDetails?: string
  status: string
}

const STATUS_COLORS: Record<string, string> = {
  BOOKING_PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED:       'bg-blue-100 text-blue-800',
  ACCEPTED:        'bg-blue-100 text-blue-700',
  ON_THE_WAY:      'bg-orange-100 text-orange-800',
  ON_SITE:         'bg-purple-100 text-purple-800',
  COMPLETED:       'bg-emerald-100 text-emerald-800',
  CANCELLED:       'bg-red-100 text-red-700',
}

// Map booking status -> next action label + new status
const NEXT_ACTION: Record<string, { label: string; next: string; color: string } | null> = {
  ACCEPTED:   { label: '🚗 Start Trip',        next: 'ON_THE_WAY', color: 'bg-orange-500 hover:bg-orange-600' },
  ON_THE_WAY: { label: '📍 Arrived at Site',   next: 'ON_SITE',    color: 'bg-purple-600 hover:bg-purple-700' },
  ON_SITE:    { label: '✅ Complete Trip',       next: 'COMPLETED',  color: 'bg-emerald-600 hover:bg-emerald-700' },
}

const TODAY = new Date().toISOString().split('T')[0]

export default function DriverDashboard() {
  const { user } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [cab, setCab] = useState<CabDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [cabLoading, setCabLoading] = useState(true)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const getStatus = (t: Trip) => t.bookingStatus || t.status || ''

  const loadTrips = useCallback(() =>
    apiClient.get('/v1/driver/trips')
      .then(r => setTrips(r.data.data || []))
      .catch(() => setError('Could not load your trips.')),
  [])

  const loadCab = useCallback(() => {
    // Get assigned cab from authenticated user's record
    if (!user?.assignedCabId) {
      setCab(null)
      return Promise.resolve()
    }
    
    return apiClient.get('/v1/admin/cabs')
      .then(r => {
        const cabs: CabDetails[] = r.data.data || []
        const mine = cabs.find((c: any) => c.cabId === user.assignedCabId)
        setCab(mine || null)
      })
      .catch(() => { /* no cab — non-critical */ })
  }, [user?.assignedCabId])

  useEffect(() => {
    Promise.all([loadTrips(), loadCab()])
      .finally(() => { setLoading(false); setCabLoading(false) })
  }, [loadTrips, loadCab])

  // WebSocket — real-time booking request push
  const handleWsMessage = useCallback((type: string, payload: Record<string, unknown>) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, type, text: type, at: Date.now() }])
    if (type === 'BOOKING_REQUEST' || type === 'BOOKING_CANCELLED_ADMIN') {
      void loadTrips()
    }
    void payload
  }, [loadTrips])

  useWebSocket(handleWsMessage)

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const advanceStatus = async (trip: Trip, nextStatus: string) => {
    setActionLoading(trip.bookingId); setError('')
    try {
      await apiClient.patch(`/v1/driver/trips/${encodeURIComponent(trip.bookingId)}/status`, {
        status: nextStatus,
      })
      setTrips(prev =>
        prev.map(t =>
          t.bookingId === trip.bookingId
            ? { ...t, bookingStatus: nextStatus, status: nextStatus }
            : t
        )
      )
      // Reload cab if completed (cab becomes AVAILABLE)
      if (nextStatus === 'COMPLETED') await loadCab()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not update trip status.')
    } finally {
      setActionLoading(null)
    }
  }

  const todayTrips = trips.filter(t => t.bookingDate === TODAY)
  const upcomingTrips = trips.filter(t => t.bookingDate > TODAY)
  const activeTrip = trips.find(t => ['ACCEPTED', 'ON_THE_WAY', 'ON_SITE'].includes(getStatus(t)))

  const count = (s: string) => trips.filter(t => getStatus(t) === s).length

  return (
    <AppLayout title="Driver Dashboard" subtitle={`Good day, ${user?.name}`}>
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />

      {/* MY VEHICLE card */}
      <div className="card mb-6 bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 text-white">
        <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-2">My Vehicle</p>
        {cabLoading ? (
          <p className="text-blue-100 text-sm">Loading vehicle details...</p>
        ) : cab ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-2xl font-bold">{cab.cabNumber}</p>
              <p className="text-blue-100 text-sm mt-0.5">{cab.vehicleModel}</p>
              <p className="text-blue-200 text-xs mt-1">Reg: {cab.registrationNumber}</p>
              {cab.vehicleDetails && <p className="text-blue-200 text-xs mt-0.5">{cab.vehicleDetails}</p>}
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                cab.status === 'AVAILABLE' ? 'bg-emerald-400/30 text-emerald-100' :
                cab.status === 'ON_TRIP'   ? 'bg-orange-400/30 text-orange-100' :
                'bg-white/20 text-white'
              }`}>
                {cab.status}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-white font-medium">No vehicle assigned</p>
            <p className="text-blue-200 text-sm mt-1">Contact admin to assign a cab to your account</p>
          </div>
        )}
      </div>

      {/* Notifications panel */}
      <DriverNotifications onRefresh={loadTrips} />

      {error && <div className="alert-error mb-4">{error}</div>}

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { icon: '📋', label: 'Total',      value: trips.length,               color: 'bg-blue-50'    },
          { icon: '🚦', label: 'Accepted',   value: count('ACCEPTED'),           color: 'bg-yellow-50'  },
          { icon: '🚗', label: 'On the Way', value: count('ON_THE_WAY'),         color: 'bg-orange-50'  },
          { icon: '✅', label: 'Completed',  value: count('COMPLETED'),          color: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="card flex flex-col items-center text-center gap-2 py-5">
            <div className={`w-10 h-10 ${s.color} rounded-xl flex items-center justify-center text-xl`}>{s.icon}</div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Active trip — prominent card */}
      {activeTrip && (
        <div className="card border-2 border-blue-200 bg-blue-50 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-sm font-bold text-blue-800 uppercase tracking-wide">Active Trip</p>
          </div>
          <TripCard
            trip={activeTrip}
            onAction={advanceStatus}
            actionLoading={actionLoading}
            getStatus={getStatus}
          />
        </div>
      )}

      {/* Today's trips */}
      {todayTrips.length > 0 && (
        <div className="card mb-6">
          <div className="mb-4">
            <p className="section-title">Today's Trips</p>
            <p className="section-subtitle">{todayTrips.length} trip{todayTrips.length !== 1 ? 's' : ''} scheduled</p>
          </div>
          <div className="space-y-4">
            {todayTrips.map(trip => (
              <TripCard
                key={trip.bookingId}
                trip={trip}
                onAction={advanceStatus}
                actionLoading={actionLoading}
                getStatus={getStatus}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming trips */}
      {upcomingTrips.length > 0 && (
        <div className="card mb-6">
          <div className="mb-4">
            <p className="section-title">Upcoming Trips</p>
          </div>
          <div className="space-y-4">
            {upcomingTrips.map(trip => (
              <TripCard
                key={trip.bookingId}
                trip={trip}
                onAction={advanceStatus}
                actionLoading={actionLoading}
                getStatus={getStatus}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past trips */}
      {!loading && trips.filter(t => getStatus(t) === 'COMPLETED' || t.bookingDate < TODAY).length > 0 && (
        <div className="card">
          <div className="mb-4">
            <p className="section-title">Past Trips</p>
          </div>
          <div className="space-y-3">
            {trips
              .filter(t => getStatus(t) === 'COMPLETED' || getStatus(t) === 'CANCELLED')
              .slice(0, 10)
              .map(trip => (
                <TripCard
                  key={trip.bookingId}
                  trip={trip}
                  onAction={advanceStatus}
                  actionLoading={actionLoading}
                  getStatus={getStatus}
                />
              ))}
          </div>
        </div>
      )}

      {!loading && trips.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">🗺️</div>
          <p className="font-medium text-gray-700">No trips assigned</p>
          <p className="text-sm text-gray-400 mt-1">Assigned site visits will appear here</p>
        </div>
      )}
    </AppLayout>
  )
}

// ── TripCard component ────────────────────────────────────────────────────────
function TripCard({
  trip,
  onAction,
  actionLoading,
  getStatus,
}: {
  trip: Trip
  onAction: (trip: Trip, next: string) => Promise<void>
  actionLoading: string | null
  getStatus: (t: Trip) => string
}) {
  const status = getStatus(trip)
  const nextAction = NEXT_ACTION[status] || null
  const isBusy = actionLoading === trip.bookingId

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      {/* Top row */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-gray-900">{trip.projectName || trip.siteLocation}</p>
          {trip.projectLocation && <p className="text-xs text-gray-400 mt-0.5">📍 {trip.projectLocation}</p>}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
          {status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
        <div>
          <p className="text-xs text-gray-400">Date</p>
          <p className="font-medium text-gray-800">{trip.bookingDate}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Time</p>
          <p className="font-medium text-gray-800">
            {trip.startTime && trip.endTime ? `${trip.startTime} – ${trip.endTime}` : trip.timeSlot}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Cab</p>
          <p className="font-medium text-gray-800">{trip.cabNumber}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">CGM</p>
          <p className="font-medium text-gray-800">{trip.cgmName}</p>
        </div>
        {trip.pickupDetails && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400">Pickup Notes</p>
            <p className="font-medium text-gray-800">{trip.pickupDetails}</p>
          </div>
        )}
      </div>

      {/* CGM contact — visible for active trips */}
      {trip.cgmMobile && ['ACCEPTED', 'ON_THE_WAY', 'ON_SITE'].includes(status) && (
        <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-3 mb-3">
          <div>
            <p className="text-xs text-emerald-700 font-medium">CGM Contact</p>
            <p className="text-sm font-bold text-emerald-900">{trip.cgmMobile}</p>
          </div>
          <a
            href={`tel:${trip.cgmMobile}`}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            📞 Call CGM
          </a>
        </div>
      )}

      {/* Action button */}
      {nextAction && (
        <button
          onClick={() => onAction(trip, nextAction.next)}
          disabled={isBusy}
          className={`w-full py-3 rounded-xl text-white font-bold text-base transition-all ${nextAction.color} ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {isBusy ? 'Updating...' : nextAction.label}
        </button>
      )}
    </div>
  )
}
