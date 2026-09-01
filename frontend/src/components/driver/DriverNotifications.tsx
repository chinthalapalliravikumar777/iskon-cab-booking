import { useEffect, useState, useCallback } from 'react'
import { getNotifications, respondBooking } from '../../api/bookings'
import apiClient from '../../api/client'

interface Notification {
  notificationId: string
  type: string
  payload: any
  sentAt: string
  readAt: string | null
}

interface Props {
  onRefresh?: () => void
}

export default function DriverNotifications({ onRefresh }: Props) {
  const [notes, setNotes] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await getNotifications()
      setNotes(data || [])
    } catch {
      setError('Could not load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleAction = async (bookingId: string, action: 'ACCEPT' | 'REJECT') => {
    setError('')
    try {
      await respondBooking(bookingId, action)
      await load()
      onRefresh?.()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Action failed')
    }
  }

  const markRead = async (notificationId: string) => {
    try {
      const id = notificationId.startsWith('NOTIF#') ? notificationId : `NOTIF#${notificationId}`
      await apiClient.patch(`/v1/notifications/${encodeURIComponent(id)}/read`)
      setNotes(prev => prev.map(n => n.notificationId === notificationId ? { ...n, readAt: new Date().toISOString() } : n))
    } catch { /* non-critical */ }
  }

  const bookingRequests = notes.filter(n => n.type === 'BOOKING_REQUEST' && !n.readAt)
  const otherUnread = notes.filter(n => n.type !== 'BOOKING_REQUEST' && !n.readAt).slice(0, 5)

  if (!loading && bookingRequests.length === 0 && otherUnread.length === 0) return null

  return (
    <div className="mb-6 space-y-3">
      {/* Booking requests — require action */}
      {bookingRequests.map(n => {
        const p = n.payload || {}
        const deadline = p.confirmationDeadline ? new Date(p.confirmationDeadline) : null
        const isExpired = deadline && deadline < new Date()

        return (
          <div key={n.notificationId} className="card border-2 border-yellow-200 bg-yellow-50">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  <p className="font-bold text-gray-900 text-sm">New Booking Request</p>
                </div>
                <p className="text-sm text-gray-700">
                  <strong>{p.bookingDate}</strong> · {p.startTime}–{p.endTime}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Cab: {p.cabNumber}</p>
                {p.pickupDetails && <p className="text-xs text-gray-500 mt-0.5">📍 {p.pickupDetails}</p>}
                {deadline && (
                  <p className={`text-xs mt-1 font-medium ${isExpired ? 'text-red-600' : 'text-yellow-700'}`}>
                    {isExpired ? '⚠️ Deadline passed' : `⏳ Respond by ${deadline.toLocaleString()}`}
                  </p>
                )}
              </div>
            </div>

            {!isExpired && (
              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition-colors"
                  onClick={() => void handleAction(p.bookingId, 'ACCEPT')}
                >
                  ✅ Accept Ride
                </button>
                <button
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-base transition-colors"
                  onClick={() => void handleAction(p.bookingId, 'REJECT')}
                >
                  ✗ Reject
                </button>
              </div>
            )}

            {isExpired && (
              <button
                className="text-xs text-gray-400 hover:text-gray-600 mt-2"
                onClick={() => void markRead(n.notificationId)}
              >
                Dismiss
              </button>
            )}
          </div>
        )
      })}

      {/* Other unread notifications */}
      {otherUnread.map(n => {
        const MSGS: Record<string, string> = {
          BOOKING_CANCELLED_ADMIN: '🚫 Admin cancelled a booking',
          BOOKING_COMPLETED_ADMIN: '✅ Admin marked a booking complete',
        }
        return (
          <div key={n.notificationId} className="card border border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-700">{MSGS[n.type] || n.type}</p>
            <button
              className="text-xs text-gray-400 hover:text-gray-600 ml-4"
              onClick={() => void markRead(n.notificationId)}
            >
              Dismiss
            </button>
          </div>
        )
      })}

      {error && <div className="alert-error">{error}</div>}
    </div>
  )
}
