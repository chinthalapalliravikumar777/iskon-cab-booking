import { useEffect, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import apiClient from '../../api/client'

interface Driver {
  userId: string
  email: string
  name: string
  mobile: string
  role: string
  status: string
  enabled: boolean
}

interface Cab {
  cabId: string
  cabNumber: string
  vehicleModel: string
  registrationNumber: string
  status: string
  assignedDriverId?: string
  assignedDriverName?: string
}

const statusBadge = (enabled: boolean) =>
  enabled
    ? 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800'
    : 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700'

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [cabs, setCabs] = useState<Cab[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Edit/assign modal state
  const [assignModal, setAssignModal] = useState<Driver | null>(null)
  const [assignCabId, setAssignCabId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [usersRes, cabsRes] = await Promise.all([
        apiClient.get('/v1/admin/users'),
        apiClient.get('/v1/admin/cabs'),
      ])
      const allUsers: Driver[] = usersRes.data.data || []
      setDrivers(allUsers.filter(u => u.role === 'DRIVER'))
      setCabs(cabsRes.data.data || [])
    } catch {
      setError('Could not load drivers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const toggleStatus = async (driver: Driver) => {
    setMessage(''); setError('')
    try {
      await apiClient.patch(`/v1/admin/users/${encodeURIComponent(driver.email)}/status`, {
        enabled: !driver.enabled,
      })
      setDrivers(prev =>
        prev.map(d => d.userId === driver.userId ? { ...d, enabled: !d.enabled } : d)
      )
      setMessage(`${driver.name} has been ${!driver.enabled ? 'enabled' : 'disabled'}.`)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not update driver status.')
    }
  }

  const openAssignModal = (driver: Driver) => {
    setAssignModal(driver)
    // Pre-fill with their current cab if any
    const currentCab = cabs.find(c => c.assignedDriverId === driver.userId)
    setAssignCabId(currentCab?.cabId || '')
  }

  const saveAssignment = async () => {
    if (!assignModal) return
    setAssignLoading(true); setMessage(''); setError('')
    try {
      if (assignCabId) {
        // Assign driver to selected cab
        const cab = cabs.find(c => c.cabId === assignCabId)
        await apiClient.patch(`/v1/admin/cabs/${encodeURIComponent(assignCabId)}`, {
          assignedDriverId: assignModal.userId,
          assignedDriverName: assignModal.name,
        })
        setCabs(prev => prev.map(c =>
          c.cabId === assignCabId
            ? { ...c, assignedDriverId: assignModal.userId, assignedDriverName: assignModal.name }
            : c.assignedDriverId === assignModal.userId
            ? { ...c, assignedDriverId: undefined, assignedDriverName: undefined }
            : c
        ))
        setMessage(`${assignModal.name} assigned to ${cab?.cabNumber}.`)
      } else {
        // Unassign — find current cab and clear driver
        const currentCab = cabs.find(c => c.assignedDriverId === assignModal.userId)
        if (currentCab) {
          await apiClient.patch(`/v1/admin/cabs/${encodeURIComponent(currentCab.cabId)}/status`, {
            status: 'AVAILABLE',
          })
          setCabs(prev => prev.map(c =>
            c.cabId === currentCab.cabId
              ? { ...c, assignedDriverId: undefined, assignedDriverName: undefined, status: 'AVAILABLE' }
              : c
          ))
        }
        setMessage(`${assignModal.name} unassigned from cab.`)
      }
      setAssignModal(null)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not assign cab.')
    } finally {
      setAssignLoading(false)
    }
  }

  const assignedCabFor = (driverId: string) => cabs.find(c => c.assignedDriverId === driverId)
  const availableCabs = cabs.filter(c => c.status !== 'INACTIVE' && c.status !== 'MAINTENANCE')

  const filtered = drivers.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.email.toLowerCase().includes(search.toLowerCase()) ||
    d.mobile?.includes(search)
  )

  return (
    <AppLayout title="Manage Drivers" subtitle="View, assign cabs and manage driver accounts">
      {message && <div className="alert-success mb-4">{message}</div>}
      {error   && <div className="alert-error mb-4">{error}</div>}

      {/* Search */}
      <div className="card mb-4">
        <input
          className="input-field"
          placeholder="Search by name, email or mobile..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Drivers table */}
      <div className="card overflow-x-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-title">All Drivers</p>
            <p className="section-subtitle">{drivers.length} driver account{drivers.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading drivers...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">🧑‍✈️</div>
            <p className="font-medium text-gray-700">No drivers found</p>
            <p className="text-sm text-gray-400 mt-1">Create driver accounts from the Dashboard</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Mobile</th>
                <th className="py-3 pr-4">Assigned Cab</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(driver => {
                const cab = assignedCabFor(driver.userId)
                return (
                  <tr key={driver.userId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 pr-4 font-medium text-gray-900">{driver.name}</td>
                    <td className="py-3 pr-4 text-gray-600">{driver.email}</td>
                    <td className="py-3 pr-4 text-gray-600">{driver.mobile || '—'}</td>
                    <td className="py-3 pr-4">
                      {cab ? (
                        <span className="font-medium text-blue-700">{cab.cabNumber} — {cab.vehicleModel}</span>
                      ) : (
                        <span className="text-gray-400">Not assigned</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={statusBadge(driver.enabled)}>
                        {driver.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50"
                          onClick={() => openAssignModal(driver)}
                        >
                          Assign Cab
                        </button>
                        <button
                          className={`text-xs font-medium px-2 py-1 rounded-lg ${driver.enabled ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                          onClick={() => void toggleStatus(driver)}
                        >
                          {driver.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Assign Cab Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Assign Cab</h2>
            <p className="text-sm text-gray-500 mb-4">Driver: <strong>{assignModal.name}</strong></p>

            <label className="input-label">Select Cab</label>
            <select
              className="input-field mb-4"
              value={assignCabId}
              onChange={e => setAssignCabId(e.target.value)}
            >
              <option value="">— Unassign (remove current cab) —</option>
              {availableCabs.map(cab => (
                <option key={cab.cabId} value={cab.cabId}>
                  {cab.cabNumber} — {cab.vehicleModel} ({cab.registrationNumber})
                  {cab.assignedDriverId && cab.assignedDriverId !== assignModal.userId
                    ? ' ⚠️ Already assigned'
                    : ''}
                </option>
              ))}
            </select>

            {error && <div className="alert-error mb-3">{error}</div>}

            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={() => void saveAssignment()} disabled={assignLoading}>
                {assignLoading ? 'Saving...' : 'Save Assignment'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setAssignModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
