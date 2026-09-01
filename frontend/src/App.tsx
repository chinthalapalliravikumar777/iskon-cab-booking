import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/auth/LoginPage'
import CGMDashboard from './pages/cgm/CGMDashboard'
import CGMHistory from './pages/cgm/CGMHistory'
import DriverDashboard from './pages/driver/DriverDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminProjects from './pages/admin/AdminProjects'
import AdminCabs from './pages/admin/AdminCabs'
import AdminDrivers from './pages/admin/AdminDrivers'
import AdminCGMs from './pages/admin/AdminCGMs'
import AdminBookings from './pages/admin/AdminBookings'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/common/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* CGM routes */}
          <Route
            path="/cgm"
            element={<ProtectedRoute allowedRoles={['CGM']}><CGMDashboard /></ProtectedRoute>}
          />
          <Route
            path="/cgm/book"
            element={<ProtectedRoute allowedRoles={['CGM']}><CGMDashboard /></ProtectedRoute>}
          />
          <Route
            path="/cgm/history"
            element={<ProtectedRoute allowedRoles={['CGM']}><CGMHistory /></ProtectedRoute>}
          />
          <Route
            path="/cgm/*"
            element={<ProtectedRoute allowedRoles={['CGM']}><CGMDashboard /></ProtectedRoute>}
          />

          {/* Driver routes */}
          <Route
            path="/driver"
            element={<ProtectedRoute allowedRoles={['DRIVER']}><DriverDashboard /></ProtectedRoute>}
          />
          <Route
            path="/driver/*"
            element={<ProtectedRoute allowedRoles={['DRIVER']}><DriverDashboard /></ProtectedRoute>}
          />

          {/* Admin routes — specific pages must come BEFORE the wildcard */}
          <Route path="/admin/cabs"     element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminCabs /></ProtectedRoute>} />
          <Route path="/admin/projects" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminProjects /></ProtectedRoute>} />
          <Route path="/admin/drivers"  element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDrivers /></ProtectedRoute>} />
          <Route path="/admin/cgms"     element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminCGMs /></ProtectedRoute>} />
          <Route path="/admin/bookings" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminBookings /></ProtectedRoute>} />
          <Route path="/admin/*"        element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />

          {/* Default */}
          <Route path="/"  element={<Navigate to="/login" replace />} />
          <Route path="*"  element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
