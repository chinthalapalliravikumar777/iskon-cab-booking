import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { registerFcmToken } from '../utils/firebaseMessaging'

export function useFcmPushNotifications() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    void registerFcmToken().catch(error => {
      console.warn('[FCM] push registration unavailable', error)
    })
  }, [user?.userId])
}