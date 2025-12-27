import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CandlestickChart, 
  Scan, 
  Shield, 
  History, 
  LineChart, 
  FlaskConical, 
  Key,
  Zap,
  LogOut,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { path: '/trading', icon: CandlestickChart, label: 'Configuration Trading' },
  { path: '/scanner', icon: Scan, label: 'Scanner Multi-Crypto' },
  { path: '/risk', icon: Shield, label: 'Risk Management' },
  { path: '/history', icon: History, label: 'Historique Trades' },
  { path: '/chart', icon: LineChart, label: 'Graphique' },
  { path: '/backtest', icon: FlaskConical, label: 'Backtesting' },
  { path: '/api', icon: Key, label: 'Configuration API' },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <nav className="fixed left-0 top-0 h-screen w-[var(--sidebar-width)] bg-card border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              HyperBot
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Smart Trading
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-primary/10 text-primary border-l-2 border-primary"
                      : "text-muted-foreground"
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span className="truncate">{user?.username || 'Utilisateur'}</span>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
        <span className="block text-center text-xs text-muted-foreground">v1.0.0</span>
      </div>
    </nav>
  );
}
