import { useEffect, useRef, useCallback } from 'react'
import { getCurrentSession } from '../utils/cognito'

type MessageHandler = (type: string, payload: Record<string, unknown>) => void

/**
 * Connects to the API Gateway WebSocket and calls `onMessage` for every
 * push notification received.  Reconnects automatically after a disconnect.
 *
 * Returns a `disconnect` function so callers can clean up on unmount.
 */
export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  const WS_URL = import.meta.env.VITE_WEBSOCKET_URL as string | undefined

  const connect = useCallback(async () => {
    if (!WS_URL) return          // WebSocket not configured — graceful no-op
    if (!isMounted.current) return

    try {
      const session = await getCurrentSession()
      if (!session || !isMounted.current) return

      const token = session.getIdToken().getJwtToken()
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.debug('[WS] connected')
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type && msg.payload) {
            handlerRef.current(msg.type as string, msg.payload as Record<string, unknown>)
          }
        } catch { /* ignore malformed messages */ }
      }

      ws.onclose = () => {
        console.debug('[WS] disconnected — will reconnect in 5s')
        if (isMounted.current) {
          reconnectTimer.current = setTimeout(() => { void connect() }, 5000)
        }
      }

      ws.onerror = (err) => {
        console.warn('[WS] error', err)
        ws.close()
      }
    } catch (err) {
      console.warn('[WS] connect failed', err)
      if (isMounted.current) {
        reconnectTimer.current = setTimeout(() => { void connect() }, 10000)
      }
    }
  }, [WS_URL])

  useEffect(() => {
    isMounted.current = true
    void connect()

    return () => {
      isMounted.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const disconnect = useCallback(() => {
    isMounted.current = false
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    wsRef.current?.close()
  }, [])

  return { disconnect }
}
