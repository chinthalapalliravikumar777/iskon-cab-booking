import { useEffect, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import apiClient from '../../api/client'

interface Booking {
  bookingId: string
  cabId: string
  cgmName: string
  cgmMobile?: string
  driverName: string
  cabNumber: string
  bookingDate: string
  startTime?: string
  endTime?: string
  timeSlot: string
  projectName?: string
  siteLocation: string
  bookingStatus: string
  status?: string
  driverResponseStatus?: string
  driverResponseDeadline?: string
  createdAt: string
  pickupDetails?: string
  cancelReason?: string
}

interface Cab {
  cabId: string
  cabNumber: string
  vehicleModel?: string
  registrationNumber?: string
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
  REJECTED:        'bg-red-100 text-red-700',
  EXPIRED:         'bg-gray-100 text-gray-500',
}

const ACTIVE_STATUSES = ['BOOKING_PENDING', 'CONFIRMED', 'ACCEPTED', 'ON_THE_WAY', 'ON_SITE']

export default function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filtered, setFiltered] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [cabs, setCabs] = useState<Cab[]>([])

  // Filters
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  // Action modal
  const [actionModal, setActionModal] = useState<{ booking: Booking; action: 'CANCEL' | 'COMPLETE' | 'ACCEPT' | 'REJECT' | 'REASSIGN' } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [reassignCabId, setReassignCabId] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filterDate) params.date = filterDate
      if (filterStatus) params.status = filterStatus
      const res = await apiClient.get('/v1/admin/bookings', { params })
      setBookings(res.data.data || [])
    } catch {
      setError('Could not load bookings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    apiClient.get('/v1/admin/cabs').then(response => setCabs(response.data.data || [])).catch(() => {})
  }, [filterDate, filterStatus])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      bookings.filter(b =>
        !q ||
        b.cgmName?.toLowerCase().includes(q) ||
        b.driverName?.toLowerCase().includes(q) ||
        b.cabNumber?.toLowerCase().includes(q) ||
        b.projectName?.toLowerCase().includes(q) ||
        b.siteLocation?.toLowerCase().includes(q)
      )
    )
  }, [bookings, search])

  const getDisplayStatus = (b: Booking) => b.bookingStatus || b.status || '—'

  const executeAction = async () => {
    if (!actionModal) return
    setActionLoading(true); setMessage(''); setError('')
    try {
      await apiClient.patch(`/v1/admin/bookings/${encodeURIComponent(actionModal.booking.bookingId)}`, {
        action: actionModal.action,
        reason: actionReason,
        cabId: actionModal.action === 'REASSIGN' ? reassignCabId : undefined,
      })
      let newStatus: string
      if (actionModal.action === 'CANCEL') newStatus = 'CANCELLED'
      else if (actionModal.action === 'COMPLETE') newStatus = 'COMPLETED'
      else if (actionModal.action === 'ACCEPT') newStatus = 'CONFIRMED'
      else if (actionModal.action === 'REJECT') newStatus = 'REJECTED'
      else newStatus = actionModal.booking.bookingStatus
      
      setBookings(prev =>
        prev.map(b =>
          b.bookingId === actionModal.booking.bookingId
            ? { ...b, bookingStatus: newStatus, status: newStatus, ...(actionModal.action === 'REASSIGN' ? { cabId: reassignCabId, cabNumber: cabs.find(c => c.cabId === reassignCabId)?.cabNumber } : {}) }
            : b
        )
      )
      setMessage(`Booking ${actionModal.action.toLowerCase()} successfully.`)
      setActionModal(null)
      setActionReason('')
      setReassignCabId('')
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Action failed.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <AppLayout title="All Bookings" subtitle="View, cancel or force-complete any booking">
      {message && <div className="alert-success mb-4">{message}</div>}
      {error   && <div className="alert-error mb-4"><span className="flex-1">{error}</span><button type="button" className="font-semibold underline" onClick={() => void load()}>Retry</button></div>}

      {/* Filters */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="input-label">Filter by Date</label>
            <input
              type="date"
              className="input-field"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
            />
          </div>
          <div>
            <label className="input-label">Filter by Status</label>
            <select className="input-field" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="BOOKING_PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="ON_THE_WAY">On the Way</option>
              <option value="ON_SITE">On Site</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REJECTED">Rejected</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          <div>
            <label className="input-label">Search</label>
            <input
              className="input-field"
              placeholder="CGM, driver, cab, project..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Bookings list */}
      <div className="card overflow-x-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-title">Bookings</p>
            <p className="section-subtitle">{filtered.length} booking{filtered.length !== 1 ? 's' : ''} found</p>
          </div>
          <button className="btn-secondary text-sm" onClick={() => void load()}>Refresh</button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading bookings...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">📋</div>
            <p className="font-medium text-gray-700">No bookings found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(b => {
              const displayStatus = getDisplayStatus(b)
              const isActive = ACTIVE_STATUSES.includes(displayStatus) || displayStatus === 'EXPIRED'
              return (
                <div key={b.bookingId} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{b.projectName || b.siteLocation}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[displayStatus] || 'bg-gray-100 text-gray-600'}`}>
                          {displayStatus}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {b.bookingDate} · {b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : b.timeSlot}
                      </p>
                      <div className="flex flex-wrap gap-x-4 mt-1.5 text-xs text-gray-400">
                        <span>ID: {b.bookingId}</span>
                        <span>🚗 {b.cabNumber}</span>
                        <span>👤 CGM: {b.cgmName}</span>
                        {b.cgmMobile && <span>CGM mobile: {b.cgmMobile}</span>}
                        <span>🧑‍✈️ Driver: {b.driverName}</span>
                        <span>Response: {b.driverResponseStatus || '—'}</span>
                        <span>Created: {b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}</span>
                        {b.pickupDetails && <span>📍 {b.pickupDetails}</span>}
                      </div>
                    </div>
                    {isActive && (
                      <div className="flex gap-2 flex-wrap flex-shrink-0">
                        {/* Show ACCEPT/REJECT for pending or timed-out driver response */}
                        {(b.driverResponseStatus === 'PENDING' || b.driverResponseStatus === 'EXPIRED' || b.bookingStatus === 'BOOKING_PENDING' || b.bookingStatus === 'EXPIRED') && (
                          <>
                            <button
                              className="text-xs font-medium text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
                              onClick={() => { setActionModal({ booking: b, action: 'ACCEPT' }); setActionReason('') }}
                            >
                              Accept
                            </button>
                            <button
                              className="text-xs font-medium text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200"
                              onClick={() => { setActionModal({ booking: b, action: 'REJECT' }); setActionReason('') }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {/* Admin can cancel, complete, or reassign any non-terminal booking. */}
                        <>
                            <button
                              className="text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200"
                              onClick={() => { setActionModal({ booking: b, action: 'CANCEL' }); setActionReason('') }}
                            >
                              Cancel
                            </button>
                            <button
                              className="text-xs font-medium text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
                              onClick={() => { setActionModal({ booking: b, action: 'COMPLETE' }); setActionReason('') }}
                            >
                              Complete
                            </button>
                            <button
                              className="text-xs font-medium text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200"
                              onClick={() => { setActionModal({ booking: b, action: 'REASSIGN' }); setActionReason(''); setReassignCabId('') }}
                            >
                              Reassign
                            </button>
                        </>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Action Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              {actionModal.action === 'CANCEL' && 'Cancel Booking'}
              {actionModal.action === 'COMPLETE' && 'Force Complete Booking'}
              {actionModal.action === 'ACCEPT' && 'Accept Booking'}
              {actionModal.action === 'REJECT' && 'Reject Booking'}
              {actionModal.action === 'REASSIGN' && 'Reassign Booking'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {actionModal.booking.projectName || actionModal.booking.siteLocation} —{' '}
              {actionModal.booking.bookingDate} · {actionModal.booking.startTime}–{actionModal.booking.endTime}
            </p>

            {actionModal.action === 'REASSIGN' ? <>
              <label className="input-label">New cab</label>
              <select className="input-field mb-4" value={reassignCabId} onChange={e => setReassignCabId(e.target.value)}>
                <option value="">Select a cab</option>
                {cabs.filter(c => c.cabId !== actionModal.booking.cabId && ['AVAILABLE', 'ASSIGNED'].includes(c.status)).map(cab => (
                  <option key={cab.cabId} value={cab.cabId}>{cab.cabNumber} — {cab.vehicleModel || 'Model not set'} ({cab.registrationNumber || 'Registration not set'})</option>
                ))}
              </select>
            </> : <>
            <label className="input-label">
              {actionModal.action === 'ACCEPT' || actionModal.action === 'REJECT' ? 'Note (optional)' : 'Reason (optional)'}
            </label>
            <input
              className="input-field mb-4"
              placeholder={
                actionModal.action === 'CANCEL' ? 'Reason for cancellation' :
                actionModal.action === 'COMPLETE' ? 'Reason for force completion' :
                actionModal.action === 'ACCEPT' ? 'Note about this decision' :
                'Reason for rejection'
              }
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
            />
            </>}

            {error && <div className="alert-error mb-3">{error}</div>}

            <div className="flex gap-3">
              <button
                className={`flex-1 ${
                  actionModal.action === 'CANCEL' ? 'btn-danger' :
                  actionModal.action === 'REJECT' ? 'btn-danger' :
                  'btn-primary'
                }`}
                onClick={() => void executeAction()}
                disabled={actionLoading || (actionModal.action === 'REASSIGN' && !reassignCabId)}
              >
                {actionLoading ? 'Processing...' : 
                  actionModal.action === 'CANCEL' ? 'Confirm Cancel' :
                  actionModal.action === 'COMPLETE' ? 'Force Complete' :
                  actionModal.action === 'ACCEPT' ? 'Confirm Accept' :
                  actionModal.action === 'REJECT' ? 'Confirm Reject' :
                  'Confirm Reassign'
                }
              </button>
              <button className="btn-secondary flex-1" onClick={() => setActionModal(null)}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
