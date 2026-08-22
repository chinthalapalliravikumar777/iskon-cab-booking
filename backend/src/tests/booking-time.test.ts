import test from 'node:test'
import assert from 'node:assert/strict'
import { intervalLockTimes, intervalOverlaps, validateInterval } from '../utils/bookingTime'

test('custom booking accepts exact boundaries', () => {
  assert.equal(intervalOverlaps({ startTime: '08:00', endTime: '09:30' }, { startTime: '09:30', endTime: '13:00' }), false)
  assert.equal(intervalOverlaps({ startTime: '09:30', endTime: '13:00' }, { startTime: '08:00', endTime: '09:30' }), false)
})

test('custom booking rejects overlapping intervals', () => {
  assert.equal(intervalOverlaps({ startTime: '09:30', endTime: '13:00' }, { startTime: '09:00', endTime: '11:00' }), true)
  assert.equal(intervalOverlaps({ startTime: '09:30', endTime: '13:00' }, { startTime: '12:30', endTime: '14:00' }), true)
})

test('custom booking creates one lock per 15-minute interval', () => {
  assert.deepEqual(intervalLockTimes({ startTime: '09:30', endTime: '10:15' }), ['09:30', '09:45', '10:00'])
  assert.equal(validateInterval({ startTime: '09:30', endTime: '13:00' }), null)
  assert.notEqual(validateInterval({ startTime: '09:35', endTime: '13:00' }), null)
})