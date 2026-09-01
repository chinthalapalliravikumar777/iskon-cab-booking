import apiClient from './client'

export async function getAvailableCabs(date: string, slot: string) {
  const res = await apiClient.get('/v1/cgm/cabs/available', { params: { date, slot } })
  return res.data.data
}

export async function createBooking(payload: any) {
  const res = await apiClient.post('/v1/cgm/bookings', payload)
  return res.data
}

export async function respondBooking(bookingId: string, action: 'ACCEPT' | 'REJECT') {
  const res = await apiClient.patch(`/v1/driver/bookings/${encodeURIComponent(bookingId)}/decision`, { action })
  return res.data
}

export async function getNotifications() {
  const res = await apiClient.get('/v1/notifications')
  return res.data.data
}

export default { getAvailableCabs, createBooking, respondBooking, getNotifications }
