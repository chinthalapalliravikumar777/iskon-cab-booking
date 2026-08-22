import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'

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

  return (
    <AppLayout title="My Dashboard" subtitle={`Welcome back, ${user?.name}`}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon="🚗" label="Active Bookings"  value="0" color="bg-blue-50" />
        <StatCard icon="✅" label="Completed Trips"  value="0" color="bg-emerald-50" />
        <StatCard icon="❌" label="Cancelled"        value="0" color="bg-red-50" />
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
          Coming in Phase 6 →
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
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">📋</div>
          <p className="font-medium text-gray-700">No bookings yet</p>
          <p className="text-sm text-gray-400 mt-1">Your bookings will appear here once you create them</p>
        </div>
      </div>
    </AppLayout>
  )
}
