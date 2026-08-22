import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/auth/LoginPage'
import CGMDashboard from './pages/cgm/CGMDashboard'
import DriverDashboard from './pages/driver/DriverDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminProjects from './pages/admin/AdminProjects'
import AdminCabs from './pages/admin/AdminCabs'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/common/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<LoginPage />} />

          {/* CGM routes - only accessible by CGM role */}
          <Route
            path="/cgm/*"
            element={
              <ProtectedRoute allowedRoles={['CGM']}>
                <CGMDashboard />
              </ProtectedRoute>
            }
          />

          {/* Driver routes - only accessible by DRIVER role */}
          <Route
            path="/driver/*"
            element={
              <ProtectedRoute allowedRoles={['DRIVER']}>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />

          {/* Admin routes - only accessible by ADMIN role */}
          <Route
            path="/admin/cabs"
            element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminCabs /></ProtectedRoute>}
          />

          <Route
            path="/admin/projects"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminProjects />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/*"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Default redirect to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
