import test from 'node:test'
import assert from 'node:assert/strict'

import { handler as createBookingHandler } from '../functions/cgm/createBooking'
import { handler as expireBookingsHandler } from '../functions/scheduler/expireBookings'
import { handler as projectsHandler } from '../functions/admin/projects'
import { dynamoDB } from '../utils/dynamodb'

const originalSend = dynamoDB.send.bind(dynamoDB)

const cgmEvent = (body: Record<string, unknown>): any => ({
  requestContext: { authorizer: { jwt: { claims: { sub: 'cgm-1', email: 'cgm@iskon.in', 'custom:role': 'CGM', name: 'Test CGM' } } } },
  body: JSON.stringify(body),
})

const adminEvent = (overrides: any): any => ({
  requestContext: { authorizer: { jwt: { claims: { sub: 'admin-1', email: 'admin@iskon.in', 'custom:role': 'ADMIN', name: 'Test Admin' } } } },
  ...overrides,
})

test('createBooking copies the assigned cab driver onto the booking', async () => {
  let transactionInput: any
  ;(dynamoDB as any).send = async (command: any) => {
    const input = command.input || command
    if (input.TableName === 'iskon-cabs' && input.Key?.PK === 'CAB#CAB-ASSIGNED') {
      return { Item: { cabId: 'CAB-ASSIGNED', cabNumber: 'CAB 1', status: 'ASSIGNED', assignedDriverId: 'driver-1', assignedDriverName: 'Driver One' } }
    }
    if (input.IndexName === 'cab-slot-index') return { Items: [] }
    if (input.TransactItems) { transactionInput = input; return {} }
    return { Items: [] }
  }

  try {
    const result = await createBookingHandler(cgmEvent({
      cabId: 'CAB-ASSIGNED', bookingDate: '2026-08-25', timeSlot: '09:00-12:00', siteLocation: 'Mysore',
    }))
    assert.equal(result.statusCode, 200)
    const bookingPut = transactionInput.TransactItems.find((item: any) => item.Put?.TableName === 'iskon-bookings')
    assert.equal(bookingPut.Put.Item.driverId, 'driver-1')
    assert.equal(bookingPut.Put.Item.driverName, 'Driver One')
  } finally {
    ;(dynamoDB as any).send = originalSend
  }
})

test('timeout scheduler expires the driver response without expiring the booking', async () => {
  let transactionInput: any
  ;(dynamoDB as any).send = async (command: any) => {
    const input = command.input || command
    if (input.TableName === 'iskon-bookings' && input.FilterExpression) {
      return { Items: [{ bookingId: 'booking-1', cgmId: 'cgm-1', driverResponseStatus: 'PENDING' }] }
    }
    if (input.TransactItems) { transactionInput = input; return {} }
    return {}
  }

  try {
    await expireBookingsHandler()
    const update = transactionInput.TransactItems[0].Update
    assert.match(update.UpdateExpression, /driverResponseStatus = :expired/)
    assert.doesNotMatch(update.UpdateExpression, /bookingStatus = :expired/)
    assert.equal(transactionInput.TransactItems.some((item: any) => item.Delete), false)
  } finally {
    ;(dynamoDB as any).send = originalSend
  }
})

test('project deletion is blocked when booking history references the project', async () => {
  let deleted = false
  ;(dynamoDB as any).send = async (command: any) => {
    const input = command.input || command
    if (input.TableName === 'iskon-projects' && input.Key) return { Item: { projectId: 'project-1', projectName: 'Used Project' } }
    if (input.TableName === 'iskon-bookings') return { Items: [{ bookingId: 'booking-1' }] }
    if (input.TableName === 'iskon-projects' && input.Key && input.ReturnValues) deleted = true
    return {}
  }

  try {
    const result = await projectsHandler(adminEvent({
      requestContext: { http: { method: 'DELETE' }, authorizer: { jwt: { claims: { sub: 'admin-1', email: 'admin@iskon.in', 'custom:role': 'ADMIN', name: 'Test Admin' } } } },
      pathParameters: { projectId: 'project-1' },
    }))
    assert.equal(result.statusCode, 409)
    assert.equal(deleted, false)
  } finally {
    ;(dynamoDB as any).send = originalSend
  }
})
