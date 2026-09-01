import { useEffect, useRef } from 'react'

export interface ToastMessage {
  id: string
  type: string
  text: string
  at: number
}

interface Props {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

const TYPE_ICON: Record<string, string> = {
  DRIVER_ACCEPTED:   '✅',
  DRIVER_ON_THE_WAY: '🚗',
  DRIVER_ARRIVED:    '📍',
  TRIP_COMPLETED:    '🎉',
  BOOKING_REQUEST:   '🔔',
  BOOKING_EXPIRED:   '⏰',
  BOOKING_CANCELLED_ADMIN: '🚫',
  BOOKING_COMPLETED_ADMIN: '✅',
}

const TYPE_TEXT: Record<string, string> = {
  DRIVER_ACCEPTED:   'Your driver has accepted the booking',
  DRIVER_ON_THE_WAY: 'Your cab is on the way',
  DRIVER_ARRIVED:    'Your cab has arrived at the site',
  TRIP_COMPLETED:    'Your site visit trip has been completed',
  BOOKING_REQUEST:   'New booking request received',
  BOOKING_EXPIRED:   'A booking has expired — driver did not respond',
  BOOKING_CANCELLED_ADMIN: 'A booking was cancelled by admin',
  BOOKING_COMPLETED_ADMIN: 'A booking was marked complete by admin',
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), 6000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [toast.id, onDismiss])

  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 shadow-lg rounded-2xl px-4 py-3 min-w-[280px] max-w-sm animate-slide-in">
      <span className="text-2xl flex-shrink-0">{TYPE_ICON[toast.type] || '🔔'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-tight">
          {TYPE_TEXT[toast.type] || toast.text}
        </p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-300 hover:text-gray-500 ml-1 text-lg leading-none flex-shrink-0"
      >
        ×
      </button>
    </div>
  )
}

export default function NotificationToast({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
