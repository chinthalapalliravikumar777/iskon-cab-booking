import { useEffect, useState } from 'react'
import apiClient from '../../api/client'

export default function ProfileAvatar({ userId, name, size = 'md' }: { userId?: string; name?: string; size?: 'sm' | 'md' }) {
  const [photoUrl, setPhotoUrl] = useState('')
  const initials = name?.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase() || 'U'
  const dimensions = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'

  useEffect(() => {
    if (!userId) return
    apiClient.get(`/v1/profile-photos/${encodeURIComponent(userId)}`).then(response => setPhotoUrl(response.data.data?.viewUrl || '')).catch(() => setPhotoUrl(''))
  }, [userId])

  return photoUrl
    ? <img src={photoUrl} alt={`${name || 'User'} profile`} className={`${dimensions} rounded-xl object-cover flex-shrink-0`} />
    : <div className={`${dimensions} rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center flex-shrink-0`}><span className="text-white font-bold">{initials}</span></div>
}