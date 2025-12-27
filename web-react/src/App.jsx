import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Trading } from '@/pages/Trading';
import { Scanner } from '@/pages/Scanner';
import { Risk } from '@/pages/Risk';
import { History } from '@/pages/History';
import { Chart } from '@/pages/Chart';
import { Backtest } from '@/pages/Backtest';
import { ApiConfig } from '@/pages/ApiConfig';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { ForgotPassword } from '@/pages/ForgotPassword';
import { ResetPassword } from '@/pages/ResetPassword';
import { useAuthStore } from '@/stores/authStore';

// Composant pour protéger les routes
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  const token = localStorage.getItem('authToken');
  
  if (!isAuthenticated && !token) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Routes publiques (auth) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Routes protégées (dashboard) */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="trading" element={<Trading />} />
          <Route path="scanner" element={<Scanner />} />
          <Route path="risk" element={<Risk />} />
          <Route path="history" element={<History />} />
          <Route path="chart" element={<Chart />} />
          <Route path="backtest" element={<Backtest />} />
          <Route path="api" element={<ApiConfig />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
