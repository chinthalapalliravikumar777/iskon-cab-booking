import { getApp, getApps, initializeApp } from 'firebase/app'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import apiClient from '../api/client'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

function isConfigured() {
  return Object.values(firebaseConfig).every(Boolean) && Boolean(vapidKey)
}

export async function registerFcmToken(): Promise<void> {
  if (!isConfigured() || !('serviceWorker' in navigator) || !('Notification' in window)) return
  if (!(await isSupported())) return

  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission
  if (permission !== 'granted') return

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration })
  if (token) await apiClient.post('/v1/notifications/push-token', { token })
}