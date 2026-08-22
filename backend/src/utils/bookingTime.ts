export type BookingInterval = { startTime: string; endTime: string }

export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return -1
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return -1
  return hours * 60 + minutes
}

export function validateInterval({ startTime, endTime }: BookingInterval): string | null {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  if (start < 0 || end < 0) return 'Times must use HH:MM format.'
  if (start >= end) return 'Start time must be before end time.'
  if (start % 15 !== 0 || end % 15 !== 0) return 'Booking times must be in 15-minute increments.'
  return null
}

export function intervalOverlaps(first: BookingInterval, second: BookingInterval): boolean {
  const firstStart = timeToMinutes(first.startTime)
  const firstEnd = timeToMinutes(first.endTime)
  const secondStart = timeToMinutes(second.startTime)
  const secondEnd = timeToMinutes(second.endTime)
  return firstStart < secondEnd && firstEnd > secondStart
}

export function intervalLockTimes({ startTime, endTime }: BookingInterval): string[] {
  const locks: string[] = []
  for (let minute = timeToMinutes(startTime); minute < timeToMinutes(endTime); minute += 15) {
    locks.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`)
  }
  return locks
}