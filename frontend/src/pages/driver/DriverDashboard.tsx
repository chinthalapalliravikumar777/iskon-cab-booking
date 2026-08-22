import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'

export default function DriverDashboard() {
  const { user } = useAuth()

  return (
    <AppLayout title="Today's Trips" subtitle={`Good day, ${user?.name}`}>
      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { icon: '📋', label: 'Assigned',   value: '0', color: 'bg-blue-50'    },
          { icon: '🚦', label: 'Accepted',   value: '0', color: 'bg-yellow-50'  },
          { icon: '🚗', label: 'On the way', value: '0', color: 'bg-orange-50'  },
          { icon: '✅', label: 'Completed',  value: '0', color: 'bg-emerald-50' },
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
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">🗺️</div>
          <p className="font-medium text-gray-700">No trips today</p>
          <p className="text-sm text-gray-400 mt-1">Your assigned trips will appear here</p>
        </div>
      </div>
    </AppLayout>
  )
}
