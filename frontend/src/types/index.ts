// ─── User & Auth Types ─────────────────────────────────────────────────────

export type UserRole = 'CGM' | 'DRIVER' | 'ADMIN'

export interface AuthUser {
  userId: string
  name: string
  email: string
  mobile: string
  role: UserRole
}

// ─── Cab Types ─────────────────────────────────────────────────────────────

export type CabStatus =
  | 'AVAILABLE'
  | 'BOOKED'
  | 'ASSIGNED'
  | 'ON_TRIP'
  | 'MAINTENANCE'
  | 'INACTIVE'

export interface Cab {
  cabId: string
  cabNumber: string
  status: CabStatus
  assignedDriverId?: string
  assignedDriverName?: string
  updatedAt: string
}

// ─── Booking Types ──────────────────────────────────────────────────────────

export type BookingStatus =
  | 'BOOKED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED' // legacy compatibility
  | 'ON_SITE'
  | 'COMPLETED'
  | 'CANCELLED'

export interface Booking {
  bookingId: string
  cgmId: string
  cgmName: string
  cabId: string
  cabNumber: string
  driverId: string
  driverName: string
  driverMobile: string  // Only visible to the CGM who owns this booking
  siteLocation: string
  bookingDate: string   // YYYY-MM-DD
  timeSlot: string      // e.g. "09:00-12:00"
  bookingStatus: BookingStatus
  createdAt: string
  updatedAt: string
}

// ─── Time Slot Types ────────────────────────────────────────────────────────

export interface TimeSlot {
  slotId: string
  label: string         // e.g. "Morning (9am - 12pm)"
  startTime: string     // "09:00"
  endTime: string       // "12:00"
  isActive: boolean
}

// ─── API Response Types ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}
