// ─── DynamoDB Record Models ─────────────────────────────────────────────────
// These match exactly what is stored in DynamoDB.
// The frontend types (frontend/src/types/index.ts) are the cleaned-up versions.

export type UserRole = 'CGM' | 'DRIVER' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'INACTIVE'

export interface UserRecord {
  PK: string          // USER#<cognitoUserId>
  SK: string          // PROFILE
  userId: string
  role: UserRole
  name: string
  mobile: string
  email: string
  status: UserStatus
  createdAt: string
  updatedAt: string
}

// ─── Cab ────────────────────────────────────────────────────────────────────

export type CabStatus =
  | 'AVAILABLE'
  | 'BOOKED'
  | 'ASSIGNED'
  | 'ON_TRIP'
  | 'MAINTENANCE'
  | 'INACTIVE'

export interface CabRecord {
  PK: string          // CAB#<cabId>
  SK: string          // DETAILS
  cabId: string
  cabNumber: string
  status: CabStatus
  assignedDriverId?: string
  assignedDriverName?: string
  updatedAt: string
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'BOOKED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface BookingRecord {
  PK: string          // BOOKING#<bookingId>
  SK: string          // DETAILS
  bookingId: string
  cgmId: string
  cgmName: string
  cgmMobile: string   // Only returned to the driver assigned to this booking
  cabId: string
  cabNumber: string
  driverId: string
  driverName: string
  driverMobile: string  // Only returned to the CGM who owns this booking
  siteLocation: string
  bookingDate: string   // YYYY-MM-DD
  timeSlot: string      // e.g. "09:00-12:00"
  bookingStatus: BookingStatus
  createdAt: string
  updatedAt: string
}

// ─── Slot Lock (prevents double booking) ────────────────────────────────────

export interface SlotLockRecord {
  PK: string   // LOCK#<cabId>#<bookingDate>#<timeSlot>
  SK: string   // LOCK
  bookingId: string
  createdAt: string
}

// ─── Time Slot ───────────────────────────────────────────────────────────────

export interface SlotRecord {
  PK: string   // SLOT#<slotId>
  SK: string   // DETAILS
  slotId: string
  label: string
  startTime: string
  endTime: string
  isActive: boolean
}
