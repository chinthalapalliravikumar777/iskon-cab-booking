import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'
import apiClient from '../../api/client'
import { useEffect, useState } from 'react'

type Trip = { bookingId: string; cgmName: string; cgmMobile?: string; cabNumber: string; bookingDate: string; startTime?: string; endTime?: string; timeSlot: string; projectName?: string; siteLocation: string; bookingStatus: string }

export default function DriverDashboard() {
  const { user } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { apiClient.get('/v1/driver/trips').then(response => setTrips(response.data.data || [])).catch(() => setError('Could not load your trips.')).finally(() => setLoading(false)) }, [])
  const count = (status: string) => trips.filter(trip => trip.bookingStatus === status).length

  return (
    <AppLayout title="Today's Trips" subtitle={`Good day, ${user?.name}`}>
      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { icon: '📋', label: 'Assigned',   value: String(trips.length), color: 'bg-blue-50'    },
          { icon: '🚦', label: 'Accepted',   value: String(count('ACCEPTED')), color: 'bg-yellow-50'  },
          { icon: '🚗', label: 'On the way', value: String(count('ON_THE_WAY')), color: 'bg-orange-50'  },
          { icon: '✅', label: 'Completed',  value: String(count('COMPLETED')), color: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="card flex flex-col items-center text-center gap-2 py-5">
            <div className={`w-10 h-10 ${s.color} rounded-xl flex items-center justify-center text-xl`}>{s.icon}</div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Today's trip list placeholder */}
      <div className="card">
        <div className="mb-4">
          <p className="section-title">Assigned Trips</p>
          <p className="section-subtitle">Trips scheduled for today</p>
        </div>
        {error && <div className="alert-error mb-4">{error}</div>}
        {loading ? <div className="py-12 text-center text-sm text-gray-400">Loading your trips...</div> : trips.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-center"><div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">🗺️</div><p className="font-medium text-gray-700">No trips assigned</p><p className="text-sm text-gray-400 mt-1">Assigned site visits will appear here</p></div> : <div className="space-y-3">{trips.map(trip => <div key={trip.bookingId} className="rounded-xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-gray-900">{trip.projectName || trip.siteLocation}</p><p className="text-sm text-gray-500">{trip.bookingDate} · {trip.startTime && trip.endTime ? `${trip.startTime}–${trip.endTime}` : trip.timeSlot} · {trip.cabNumber}</p><p className="text-xs text-gray-400 mt-1">CGM: {trip.cgmName} · {trip.cgmMobile || 'Mobile unavailable'}</p></div><span className="badge-booked">{trip.bookingStatus}</span></div>)}</div>}
      </div>
    </AppLayout>
  )
}
