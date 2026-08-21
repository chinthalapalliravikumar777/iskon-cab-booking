import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'

export default function CGMDashboard() {
  const { user } = useAuth()
  return (
    <AppLayout title="My Bookings">
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
        <p className="text-lg font-medium">Welcome, {user?.name}</p>
        <p className="text-sm mt-2">Cab booking workflow coming in Phase 6.</p>
      </div>
    </AppLayout>
  )
}
