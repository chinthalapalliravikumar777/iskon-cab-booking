import { useEffect, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import apiClient from '../../api/client'

type Cab = { cabId: string; cabNumber: string; vehicleModel?: string; registrationNumber?: string; vehicleDetails?: string; status: string; assignedDriverId?: string; assignedDriverName?: string }
type CabForm = { cabNumber: string; vehicleModel: string; registrationNumber: string; vehicleDetails: string; status: string; assignedDriverId: string; assignedDriverName: string }
const emptyForm: CabForm = { cabNumber: '', vehicleModel: '', registrationNumber: '', vehicleDetails: '', status: 'AVAILABLE', assignedDriverId: '', assignedDriverName: '' }
const statuses = ['AVAILABLE', 'RESERVED', 'ASSIGNED', 'ON_TRIP', 'MAINTENANCE', 'INACTIVE']

export default function AdminCabs() {
  const [cabs, setCabs] = useState<Cab[]>([])
  const [form, setForm] = useState<CabForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('ALL')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadCabs = async () => { try { const response = await apiClient.get('/v1/admin/cabs'); setCabs(response.data.data || []) } catch { setError('Could not load cabs.') } }
  useEffect(() => { void loadCabs() }, [])

  const saveCab = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setMessage(''); setError('')
    try {
      if (editingId) await apiClient.patch(`/v1/admin/cabs/${editingId}`, form)
      else await apiClient.post('/v1/admin/cabs', form)
      setMessage(editingId ? 'Cab updated.' : 'Cab added.'); setForm(emptyForm); setEditingId(null); await loadCabs()
    } catch (requestError: any) { setError(requestError.response?.data?.error || 'Could not save cab.') } finally { setLoading(false) }
  }

  const visible = filter === 'ALL' ? cabs : cabs.filter(cab => cab.status === filter)
  return <AppLayout title="Manage Cabs" subtitle="Maintain the fleet and its driver assignments">
    <div className="mb-8 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-blue-700 p-6 md:p-8 text-white shadow-lg"><div className="flex flex-wrap justify-between gap-5 items-end"><div><p className="text-xs uppercase tracking-widest text-cyan-200 font-semibold">Fleet control</p><h2 className="mt-2 text-2xl md:text-3xl font-bold">A clear view of every vehicle</h2><p className="mt-2 text-sm leading-6 text-blue-100">Assign one active driver to one active cab and keep maintenance status visible.</p></div><div className="text-right"><p className="text-3xl font-bold">{cabs.length}</p><p className="text-xs text-blue-100">Total cabs</p></div></div></div>
    {message && <div className="alert-success mb-5">{message}</div>}{error && <div className="alert-error mb-5">{error}</div>}
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 items-start">
      <form onSubmit={saveCab} className="card xl:sticky xl:top-6"><div className="mb-5"><p className="section-title">{editingId ? 'Edit cab' : 'Add cab'}</p><p className="section-subtitle">Use the exact vehicle and driver details shown to the team.</p></div><div className="space-y-4">
        <div><label className="input-label" htmlFor="cab-number">Cab name / number</label><input id="cab-number" required value={form.cabNumber} onChange={event => setForm({ ...form, cabNumber: event.target.value })} className="input-field" placeholder="Cab 01" /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="input-label" htmlFor="vehicle-model">Vehicle model</label><input id="vehicle-model" required value={form.vehicleModel} onChange={event => setForm({ ...form, vehicleModel: event.target.value })} className="input-field" placeholder="Toyota Innova" /></div><div><label className="input-label" htmlFor="registration">Registration</label><input id="registration" required value={form.registrationNumber} onChange={event => setForm({ ...form, registrationNumber: event.target.value })} className="input-field" placeholder="AP XX XXXX" /></div></div>
        <div><label className="input-label" htmlFor="cab-details">Vehicle details</label><textarea id="cab-details" rows={2} value={form.vehicleDetails} onChange={event => setForm({ ...form, vehicleDetails: event.target.value })} className="input-field resize-none" placeholder="Colour, seating, notes" /></div>
        <div><label className="input-label" htmlFor="cab-status">Status</label><select id="cab-status" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} className="input-field">{statuses.map(status => <option key={status}>{status}</option>)}</select></div>
        <div className="border-t border-gray-100 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Driver assignment</p><div className="space-y-3"><input value={form.assignedDriverId} onChange={event => setForm({ ...form, assignedDriverId: event.target.value })} className="input-field" placeholder="Driver login ID / Cognito ID" /><input value={form.assignedDriverName} onChange={event => setForm({ ...form, assignedDriverName: event.target.value })} className="input-field" placeholder="Driver name" /></div></div>
        <div className="flex gap-3"><button type="submit" disabled={loading} className="btn-primary">{editingId ? 'Save changes' : 'Add cab'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm) }} className="btn-secondary">Cancel</button>}</div>
      </div></form>
      <section className="card"><div className="flex flex-wrap items-center justify-between gap-4 mb-5"><div><p className="section-title">Fleet directory</p><p className="section-subtitle">{visible.length} cab{visible.length === 1 ? '' : 's'} shown</p></div><select aria-label="Filter cabs by status" value={filter} onChange={event => setFilter(event.target.value)} className="input-field w-auto"><option value="ALL">All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></div>{visible.length === 0 ? <div className="py-14 text-center text-sm text-gray-400">No cabs found.</div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{visible.map(cab => <article key={cab.cabId} className="rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all"><div className="flex justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{cab.cabNumber}</h3><p className="text-sm text-gray-500 mt-1">{cab.vehicleModel || 'Model not set'}</p><p className="text-xs text-gray-400 mt-1">{cab.registrationNumber || 'Registration not set'}</p></div><span className={cab.status === 'AVAILABLE' ? 'badge-available' : cab.status === 'MAINTENANCE' ? 'badge-maintenance' : cab.status === 'INACTIVE' ? 'badge-cancelled' : 'badge-booked'}>{cab.status}</span></div><div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Driver: <span className="font-medium text-gray-800">{cab.assignedDriverName || 'Unassigned'}</span></div><button type="button" onClick={() => { setEditingId(cab.cabId); setForm({ cabNumber: cab.cabNumber, vehicleModel: cab.vehicleModel || '', registrationNumber: cab.registrationNumber || '', vehicleDetails: cab.vehicleDetails || '', status: cab.status, assignedDriverId: cab.assignedDriverId || '', assignedDriverName: cab.assignedDriverName || '' }) }} className="mt-3 text-xs font-semibold text-blue-700">Edit cab</button></article>)}</div>}</section>
    </div>
  </AppLayout>
}