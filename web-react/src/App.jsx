import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Trading } from '@/pages/Trading';
import { Scanner } from '@/pages/Scanner';
import { Risk } from '@/pages/Risk';
import { History } from '@/pages/History';
import { Chart } from '@/pages/Chart';
import { Backtest } from '@/pages/Backtest';
import { ApiConfig } from '@/pages/ApiConfig';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
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
