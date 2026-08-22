import test from 'node:test'
import assert from 'node:assert/strict'

import { handler as createBookingHandler } from '../functions/cgm/createBooking'
import { handler as updateTripStatusHandler } from '../functions/driver/updateTripStatus'
import { dynamoDB } from '../utils/dynamodb'

const originalSend = dynamoDB.send.bind(dynamoDB)

test('createBooking prevents duplicate booking for same cab and time slot', async () => {
  ;(dynamoDB as any).send = async (command: any) => {
    const input = command.input || command
    if (input.TableName === 'iskon-cabs' && input.Key?.['PK'] === 'CAB#CAB-100') {
      return { Item: { PK: 'CAB#CAB-100', SK: 'DETAILS', cabId: 'CAB-100', cabNumber: 'KA01AB1234', status: 'AVAILABLE' } }
    }

    if (input.IndexName === 'cab-slot-index') {
      return { Items: [] }
    }

    if (input.TransactItems) {
      return {}
    }

    return { Items: [] }
  }

  const event: any = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'user-1',
            email: 'cgm@iskon.in',
            'custom:role': 'CGM',
            name: 'Test CGM',
          },
        },
      },
    },
    body: JSON.stringify({
      cabId: 'CAB-100',
      bookingDate: '2026-08-25',
      timeSlot: '09:00-12:00',
      siteLocation: 'Mysore',
    }),
  }

  const result = await createBookingHandler(event)
  assert.equal(result.statusCode, 200)
  const body = JSON.parse(result.body)
  assert.equal(body.success, true)
  assert.match(body.data.bookingId, /^[0-9a-f-]{36}$/i)

  ;(dynamoDB as any).send = originalSend
})

test('createBooking returns conflict when cab is already booked for the same slot', async () => {
  ;(dynamoDB as any).send = async (command: any) => {
    const input = command.input || command
    if (input.TableName === 'iskon-cabs' && input.Key?.['PK'] === 'CAB#CAB-200') {
      return { Item: { PK: 'CAB#CAB-200', SK: 'DETAILS', cabId: 'CAB-200', cabNumber: 'KA02AB5678', status: 'AVAILABLE' } }
    }

    if (input.IndexName === 'cab-slot-index') {
      return { Items: [{ bookingId: 'existing-booking' }] }
    }

    return { Items: [] }
  }

  const event: any = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'user-2',
            email: 'cgm2@iskon.in',
            'custom:role': 'CGM',
            name: 'Other CGM',
          },
        },
      },
    },
    body: JSON.stringify({
      cabId: 'CAB-200',
      bookingDate: '2026-08-25',
      timeSlot: '09:00-12:00',
      siteLocation: 'Bengaluru',
    }),
  }

  const result = await createBookingHandler(event)
  assert.equal(result.statusCode, 409)
  const body = JSON.parse(result.body)
  assert.equal(body.success, false)

  ;(dynamoDB as any).send = originalSend
})

test('updateTripStatus rejects a driver who does not own the booking', async () => {
  ;(dynamoDB as any).send = async (command: any) => {
    const input = command.input || command
    if (input.TableName === 'iskon-bookings' && input.Key?.['PK'] === 'BOOKING#booking-1') {
      return {
        Item: {
          PK: 'BOOKING#booking-1',
          SK: 'DETAILS',
          bookingId: 'booking-1',
          driverId: 'driver-999',
          driverName: 'Other Driver',
          bookingStatus: 'BOOKED',
        },
      }
    }

    return { Item: null }
  }

  const event: any = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'driver-1',
            email: 'driver@iskon.in',
            'custom:role': 'DRIVER',
            name: 'Wrong Driver',
          },
        },
      },
    },
    pathParameters: { bookingId: 'booking-1' },
    body: JSON.stringify({ status: 'ACCEPTED' }),
  }

  const result = await updateTripStatusHandler(event)
  assert.equal(result.statusCode, 403)
  const body = JSON.parse(result.body)
  assert.equal(body.success, false)

  ;(dynamoDB as any).send = originalSend
})
