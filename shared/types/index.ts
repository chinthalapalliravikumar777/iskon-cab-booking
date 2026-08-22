// ============================================================
// @iskon/shared-types
//
// These types are shared between the frontend and backend.
// Both must agree on the shape of every API request and response.
// If you change a field here, update the frontend AND backend.
// ============================================================

// ─── User & Auth ────────────────────────────────────────────

export type UserRole = 'CGM' | 'DRIVER' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'INACTIVE'

export interface User {
  userId: string
  name: string
  email: string
  mobile: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
}

// ─── Cab ────────────────────────────────────────────────────

export type CabStatus =
  | 'AVAILABLE'
  | 'RESERVED'
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

// ─── Time Slot ───────────────────────────────────────────────

export interface TimeSlot {
  slotId: string
  label: string       // e.g. "Morning (9am - 12pm)"
  startTime: string   // "09:00"
  endTime: string     // "12:00"
  isActive: boolean
}

// ─── Project ─────────────────────────────────────────────────

export type ProjectStatus = 'ACTIVE' | 'INACTIVE'

export interface Project {
  projectId: string
  projectName: string
  location: string
  status: ProjectStatus
  description?: string
  createdAt: string
  updatedAt: string
}

// ─── Booking ─────────────────────────────────────────────────

export type BookingStatus =
  | 'BOOKED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
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
  driverMobile: string  // Only included in responses to the booking's own CGM
  siteLocation: string
  bookingDate: string   // YYYY-MM-DD
  timeSlot: string      // e.g. "09:00-12:00"
  startTime?: string
  endTime?: string
  projectId?: string
  projectName?: string
  projectLocation?: string
  pickupDetails?: string
  bookingStatus: BookingStatus
  createdAt: string
  updatedAt: string
}

// ─── API Request Bodies ──────────────────────────────────────

export interface CreateBookingRequest {
  cabId: string
  bookingDate: string   // YYYY-MM-DD
  timeSlot: string      // e.g. "09:00-12:00"
  siteLocation: string
}

export interface UpdateTripStatusRequest {
  status: BookingStatus
}

export interface UpdateCabStatusRequest {
  status: CabStatus
  reason?: string       // Optional admin note
}

// ─── API Responses ───────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  count: number
  nextToken?: string    // For DynamoDB pagination in future
}

// ─── Driver view of a trip (cgmMobile included) ─────────────

export interface TripForDriver extends Omit<Booking, 'driverMobile'> {
  cgmMobile: string     // Driver can see the CGM's mobile for their assigned trips
}
