import { useEffect, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import apiClient from '../../api/client'

type Project = {
  projectId: string
  projectName: string
  location: string
  status: 'ACTIVE' | 'INACTIVE'
  description?: string
}

const initialForm = { projectName: '', location: '', description: '' }

export default function AdminProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | Project['status']>('ALL')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadProjects = async () => {
    try {
      const response = await apiClient.get('/v1/projects')
      setProjects(response.data.data || [])
    } catch {
      setError('Could not load projects.')
    }
  }

  useEffect(() => { void loadProjects() }, [])

  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    try {
      if (editingId) await apiClient.patch(`/v1/projects/${editingId}`, form)
      else await apiClient.post('/v1/projects', form)
      setMessage(editingId ? 'Project updated.' : 'Project added.')
      setForm(initialForm)
      setEditingId(null)
      await loadProjects()
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Could not save project.')
    } finally {
      setLoading(false)
    }
  }

  const toggleProject = async (project: Project) => {
    setLoading(true)
    setMessage('')
    setError('')
    try {
      await apiClient.patch(`/v1/projects/${project.projectId}`, { status: project.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      setMessage(`${project.projectName} is now ${project.status === 'ACTIVE' ? 'inactive' : 'active'}.`)
      await loadProjects()
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Could not update project status.')
    } finally {
      setLoading(false)
    }
  }

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Delete ${project.projectName}? Projects used by booking history cannot be deleted.`)) return
    setLoading(true)
    setMessage('')
    setError('')
    try {
      await apiClient.delete(`/v1/projects/${encodeURIComponent(project.projectId)}`)
      setMessage(`${project.projectName} deleted.`)
      await loadProjects()
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Could not delete project.')
    } finally {
      setLoading(false)
    }
  }

  const visibleProjects = filter === 'ALL' ? projects : projects.filter(project => project.status === filter)

  return (
    <AppLayout title="Manage Projects" subtitle="Control the destinations available for site visits">
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-blue-950 via-blue-800 to-cyan-700 p-6 md:p-8 text-white shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200">Site visit destinations</p>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold">A cleaner project directory</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">Keep project names and locations accurate so every new booking starts with the right destination.</p>
          </div>
          <div className="text-right"><p className="text-3xl font-bold">{projects.filter(project => project.status === 'ACTIVE').length}</p><p className="text-xs text-cyan-100">Active projects</p></div>
        </div>
      </div>

      {message && <div className="alert-success mb-5">{message}</div>}
      {error && <div className="alert-error mb-5">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 items-start">
        <form onSubmit={saveProject} className="card xl:sticky xl:top-6">
          <div className="mb-5"><p className="section-title">{editingId ? 'Edit project' : 'Add project'}</p><p className="section-subtitle">Changes apply to future bookings. Existing bookings keep their historical details.</p></div>
          <div className="space-y-4">
            <div><label className="input-label" htmlFor="project-name">Project name</label><input id="project-name" required value={form.projectName} onChange={event => setForm({ ...form, projectName: event.target.value })} className="input-field" placeholder="ISKON City 1" /></div>
            <div><label className="input-label" htmlFor="project-location">Location</label><input id="project-location" required value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} className="input-field" placeholder="Mysore Road" /></div>
            <div><label className="input-label" htmlFor="project-description">Description <span className="font-normal text-gray-400">(optional)</span></label><textarea id="project-description" rows={3} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="input-field resize-none" placeholder="Add a short note for the team" /></div>
            <div className="flex gap-3"><button type="submit" disabled={loading} className="btn-primary">{editingId ? 'Save changes' : 'Add project'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(initialForm) }} className="btn-secondary">Cancel</button>}</div>
          </div>
        </form>

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5"><div><p className="section-title">Project directory</p><p className="section-subtitle">{visibleProjects.length} project{visibleProjects.length === 1 ? '' : 's'} shown</p></div><div className="flex gap-1 rounded-xl bg-gray-100 p-1">{(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(option => <button key={option} type="button" onClick={() => setFilter(option)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === option ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>{option === 'ALL' ? 'All' : option === 'ACTIVE' ? 'Active' : 'Inactive'}</button>)}</div></div>
          {visibleProjects.length === 0 ? <div className="py-14 text-center text-sm text-gray-400">No projects found.</div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{visibleProjects.map(project => <article key={project.projectId} className="rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{project.projectName}</h3><p className="mt-1 text-sm text-gray-500">{project.location}</p></div><span className={project.status === 'ACTIVE' ? 'badge-available' : 'badge-completed'}>{project.status}</span></div>{project.description && <p className="mt-3 text-xs leading-5 text-gray-400">{project.description}</p>}<div className="mt-4 flex gap-3 border-t border-gray-50 pt-3"><button type="button" onClick={() => { setEditingId(project.projectId); setForm({ projectName: project.projectName, location: project.location, description: project.description || '' }) }} className="text-xs font-semibold text-blue-700">Edit</button><button type="button" disabled={loading} onClick={() => void toggleProject(project)} className="text-xs font-semibold text-gray-500">{project.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button><button type="button" disabled={loading} onClick={() => void deleteProject(project)} className="text-xs font-semibold text-red-600">Delete</button></div></article>)}</div>}
        </section>
      </div>
    </AppLayout>
  )
}