import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useThemeStore } from '@/stores/themeStore';

const pageTitles = {
  '/': 'Tableau de bord',
  '/trading': 'Configuration Trading',
  '/scanner': 'Scanner Multi-Crypto',
  '/risk': 'Risk Management',
  '/history': 'Historique Trades',
  '/chart': 'Graphique',
  '/backtest': 'Backtesting',
  '/api': 'Configuration API',
};

export function Layout() {
  const location = useLocation();
  const { theme } = useThemeStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const title = pageTitles[location.pathname] || 'Dashboard';

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="lg:ml-[var(--sidebar-width)]">
        <Header title={title} onToggleMobile={() => setMobileMenuOpen(!mobileMenuOpen)} />
        
        <main className="p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
