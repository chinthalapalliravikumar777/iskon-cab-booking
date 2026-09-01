import { useEffect, useState } from 'react'
import { getAvailableCabs, createBooking } from '../../api/bookings'
import apiClient from '../../api/client'

interface Project { projectId: string; projectName: string; location: string; status: string }
interface Cab     { cabId: string; cabNumber: string; vehicleModel?: string; status: string; assignedDriverName?: string }

const FIXED_SLOTS = [
  ['06:00', '08:30'], ['08:30', '11:00'], ['11:00', '13:30'],
  ['13:30', '16:00'], ['16:00', '18:30'], ['18:30', '21:00'], ['21:00', '23:30'],
]

const MIN_SLOT_MINUTES = 30
const MAX_ADVANCE_DAYS = 30

const todayStr = () => new Date().toISOString().split('T')[0]
const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

interface Props { onBooked?: () => void }

export default function BookingForm({ onBooked }: Props) {
  const [date, setDate] = useState('')
  const [isCustomSlot, setIsCustomSlot] = useState(false)
  const [slotIndex, setSlotIndex] = useState<number | null>(0)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [cabs, setCabs] = useState<Cab[]>([])
  const [selectedCab, setSelectedCab] = useState('')
  const [pickupDetails, setPickupDetails] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('error')
  const [fieldError, setFieldError] = useState('')
  const [loading, setLoading] = useState(false)

  const minDate = todayStr()
  const maxDate = new Date(Date.now() + MAX_ADVANCE_DAYS * 86400000).toISOString().split('T')[0]

  // Load active projects once
  useEffect(() => {
    apiClient.get('/v1/projects')
      .then(r => {
        const all: Project[] = r.data.data || []
        setProjects(all.filter(p => p.status === 'ACTIVE'))
      })
      .catch(() => { /* non-critical */ })
  }, [])

  function validateSlot(): string {
    if (!date) return ''
    if (date < minDate) return 'Booking date cannot be in the past'
    if (date > maxDate) return `Bookings can only be made up to ${MAX_ADVANCE_DAYS} days in advance`
    if (isCustomSlot) {
      if (!customStart || !customEnd) return ''
      const s = toMinutes(customStart), e = toMinutes(customEnd)
      if (e <= s) return 'End time must be after start time'
      if (e - s < MIN_SLOT_MINUTES) return `Slot must be at least ${MIN_SLOT_MINUTES} minutes`
      if (date === minDate && s < new Date().getHours() * 60 + new Date().getMinutes()) return 'Start time cannot be in the past'
    } else {
      if (slotIndex === null) return 'Please select a time slot'
      if (date === minDate) {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
        if (toMinutes(FIXED_SLOTS[slotIndex][0]) < nowMin) return 'This slot has already passed today'
      }
    }
    return ''
  }

  useEffect(() => {
    const err = validateSlot()
    setFieldError(err)
    setCabs([])
    setSelectedCab('')
    if (!date || err) return
    if (!isCustomSlot && slotIndex !== null) void fetchCabs()
    else if (isCustomSlot && customStart && customEnd) void fetchCabs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isCustomSlot, slotIndex, customStart, customEnd])

  async function fetchCabs() {
    setLoading(true); setMessage('')
    try {
      const slot = isCustomSlot
        ? `${customStart}-${customEnd}`
        : `${FIXED_SLOTS[slotIndex!][0]}-${FIXED_SLOTS[slotIndex!][1]}`
      const data: Cab[] = await getAvailableCabs(date, slot)
      setCabs(data || [])
      if (!data || data.length === 0) { setMessage('No cabs available for this slot'); setMessageType('error') }
    } catch { setMessage('Could not load available cabs'); setMessageType('error') }
    setLoading(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMessage('')
    if (!date || !selectedCab) { setMessage('Please select a date, time, and cab'); setMessageType('error'); return }
    const slotErr = validateSlot()
    if (slotErr) { setMessage(slotErr); setMessageType('error'); return }

    let startTime: string, endTime: string
    if (isCustomSlot) { startTime = customStart; endTime = customEnd }
    else { [startTime, endTime] = FIXED_SLOTS[slotIndex!] }

    const selectedProject = projects.find(p => p.projectId === projectId)

    setLoading(true)
    try {
      const res = await createBooking({
        cabId: selectedCab,
        bookingDate: date,
        startTime,
        endTime,
        siteLocation: selectedProject?.location || selectedProject?.projectName || 'ISKON Site Visit',
        projectId: projectId || undefined,
        projectName: selectedProject?.projectName,
        projectLocation: selectedProject?.location,
        pickupDetails: pickupDetails.trim() || undefined,
      })
      if (res.success) {
        setMessage(`✅ Booking created! Driver must confirm by ${new Date(res.data.confirmationDeadline).toLocaleTimeString()}`)
        setMessageType('success')
        setDate(''); setSlotIndex(0); setCustomStart(''); setCustomEnd('')
        setCabs([]); setSelectedCab(''); setProjectId(''); setPickupDetails('')
        onBooked?.()
      } else {
        setMessage(res.error || 'Booking failed'); setMessageType('error')
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.error || 'Booking request failed'); setMessageType('error')
    }
    setLoading(false)
  }

  const reset = () => {
    setDate(''); setIsCustomSlot(false); setSlotIndex(0)
    setCustomStart(''); setCustomEnd(''); setCabs([])
    setSelectedCab(''); setProjectId(''); setPickupDetails('')
    setMessage(''); setFieldError('')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Date */}
      <div>
        <label className="input-label text-white/80">Date</label>
        <input type="date" className="input-field" value={date} min={minDate} max={maxDate}
          onChange={e => setDate(e.target.value)} required />
      </div>

      {/* Time slot */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="input-label text-white/80 mb-0">Time Slot</label>
          <button type="button" onClick={() => setIsCustomSlot(!isCustomSlot)}
            className="text-xs text-blue-200 font-medium hover:text-white">
            {isCustomSlot ? 'Use fixed slots' : 'Custom time'}
          </button>
        </div>
        {isCustomSlot ? (
          <div className="grid grid-cols-2 gap-2">
            <input type="time" className="input-field" value={customStart} onChange={e => setCustomStart(e.target.value)} required />
            <input type="time" className="input-field" value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   required />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {FIXED_SLOTS.map((s, i) => (
              <button type="button" key={i} onClick={() => setSlotIndex(i)}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${slotIndex === i ? 'bg-white text-blue-700' : 'bg-white/15 text-white hover:bg-white/25'}`}>
                {s[0]}–{s[1]}
              </button>
            ))}
          </div>
        )}
        {fieldError && <p className="text-xs text-red-300 mt-1">{fieldError}</p>}
      </div>

      {/* Project */}
      {projects.length > 0 && (
        <div>
          <label className="input-label text-white/80">Project</label>
          <select className="input-field" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">— Select project (optional) —</option>
            {projects.map(p => (
              <option key={p.projectId} value={p.projectId}>{p.projectName} — {p.location}</option>
            ))}
          </select>
        </div>
      )}

      {/* Available cabs */}
      {cabs.length > 0 && (
        <div>
          <label className="input-label text-white/80">Select Cab</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cabs.map(c => (
              <button type="button" key={c.cabId} onClick={() => setSelectedCab(c.cabId)}
                className={`rounded-xl border px-4 py-3 text-sm text-left transition-colors ${
                  selectedCab === c.cabId
                    ? 'bg-white text-blue-700 border-white'
                    : 'bg-white/15 text-white border-white/30 hover:bg-white/25'
                }`}>
                <p className="font-semibold">{c.cabNumber}</p>
                {c.vehicleModel && <p className="text-xs opacity-80">{c.vehicleModel}</p>}
                {c.assignedDriverName && <p className="text-xs opacity-70">Driver: {c.assignedDriverName}</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pickup details */}
      <div>
        <label className="input-label text-white/80">Pickup Notes (optional)</label>
        <input className="input-field" value={pickupDetails}
          onChange={e => setPickupDetails(e.target.value)}
          placeholder="Gate number, landmark, instructions..." />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading || !!fieldError || !selectedCab}
          className="btn-primary flex-1 disabled:opacity-60 disabled:cursor-not-allowed">
          {loading ? 'Processing...' : 'Request Booking'}
        </button>
        <button type="button" onClick={reset} className="btn-secondary">Reset</button>
      </div>

      {message && (
        <div className={`text-sm rounded-xl px-3 py-2 ${
          messageType === 'success' ? 'bg-emerald-500/20 text-white' : 'bg-red-500/20 text-red-200'
        }`}>
          {message}
        </div>
      )}
    </form>
  )
}
