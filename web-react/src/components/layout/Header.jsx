import { useState } from 'react';
import { Sun, Moon, Play, Square, User, ChevronDown, Settings, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

export function Header({ title, onToggleMobile }) {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const [isRunning, setIsRunning] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  return (
    <header className="sticky top-0 z-40 h-16 bg-background/80 backdrop-blur-lg border-b border-border flex items-center justify-between px-6">
      {/* Left */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobile}
          className="lg:hidden p-2 rounded-lg hover:bg-accent"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center hover:bg-accent transition-all hover:scale-105"
          title="Changer le thème"
        >
          {theme === 'dark' ? (
            <Moon className="w-5 h-5 text-primary" />
          ) : (
            <Sun className="w-5 h-5 text-warning" />
          )}
        </button>

        {/* Connection Status */}
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm">
          <span className={cn(
            "w-2.5 h-2.5 rounded-full",
            isConnected ? "bg-success animate-pulse" : "bg-destructive"
          )} />
          <span className="text-muted-foreground">
            {isConnected ? 'Connecté' : 'Déconnecté'}
          </span>
        </div>

        {/* Bot Controls */}
        <div className="flex gap-2">
          {!isRunning ? (
            <Button variant="success" size="sm" onClick={() => setIsRunning(true)}>
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Démarrer</span>
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setIsRunning(false)}>
              <Square className="w-4 h-4" />
              <span className="hidden sm:inline">Arrêter</span>
            </Button>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">{user?.username || 'Compte'}</span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
              <div className="px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">{user?.email || 'email@example.com'}</span>
              </div>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors">
                <Settings className="w-4 h-4" />
                Paramètres du compte
              </button>
              <button 
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-destructive transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
