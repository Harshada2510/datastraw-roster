import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './components/DashboardLayout'
import AssignmentsPage from './pages/AssignmentsPage'
import BrandsPage from './pages/BrandsPage'
import CalendarPage from './pages/CalendarPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import HolidaysPage from './pages/HolidaysPage'
import LeavesPage from './pages/LeavesPage'
import PodsPage from './pages/PodsPage'
import ProcessesPage from './pages/ProcessesPage'
import RosterPage from './pages/RosterPage'
import StaffingRequirementsPage from './pages/StaffingRequirementsPage'
import WeeklyOffsPage from './pages/WeeklyOffsPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="processes" element={<ProcessesPage />} />
        <Route path="pods" element={<PodsPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="leaves" element={<LeavesPage />} />
        <Route path="weekly-offs" element={<WeeklyOffsPage />} />
        <Route path="holidays" element={<HolidaysPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="staffing-requirements" element={<StaffingRequirementsPage />} />
        <Route path="roster" element={<RosterPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
