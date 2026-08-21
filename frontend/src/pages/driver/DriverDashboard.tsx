import AppLayout from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'

export default function DriverDashboard() {
  const { user } = useAuth()
  return (
    <AppLayout title="My Trips">
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
        <p className="text-lg font-medium">Welcome, {user?.name}</p>
        <p className="text-sm mt-2">Trip workflow coming in Phase 7.</p>
      </div>
    </AppLayout>
  )
}
