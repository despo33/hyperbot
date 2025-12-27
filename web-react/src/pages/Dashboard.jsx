import { useState, useEffect, useRef } from 'react';
import { Activity, Wallet, BarChart2, TrendingUp, TrendingDown, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { botAPI, tradingAPI, accountAPI, createWebSocket } from '@/services/api';

export function Dashboard() {
  const [status, setStatus] = useState(null);
  const [balance, setBalance] = useState(null);
  const [positions, setPositions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);

  // Charge les données initiales
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [statusRes, positionsRes, statsRes] = await Promise.all([
          botAPI.getStatus().catch(() => null),
          tradingAPI.getPositions().catch(() => ({ positions: [] })),
          accountAPI.getStats().catch(() => null),
        ]);
        
        if (statusRes) {
          setStatus(statusRes.bot);
          setBalance(statusRes.balance);
        }
        setPositions(positionsRes?.positions || []);
        setStats(statsRes);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh toutes les 30s
    return () => clearInterval(interval);
  }, []);

  // WebSocket pour les logs en temps réel
  useEffect(() => {
    wsRef.current = createWebSocket(
      (data) => {
        if (data.type === 'log') {
          setLogs(prev => [...prev.slice(-99), data.data]);
        } else if (data.type === 'botStatus') {
          setStatus(prev => ({ ...prev, ...data.data }));
        }
      },
      () => setLogs(prev => [...prev, { message: 'WebSocket connecté', level: 'info', timestamp: Date.now() }]),
      () => setLogs(prev => [...prev, { message: 'WebSocket déconnecté', level: 'warn', timestamp: Date.now() }])
    );
    
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Auto-scroll des logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const formatTime = (ts) => {
    if (!ts) return '--:--:--';
    return new Date(ts).toLocaleTimeString('fr-FR');
  };

  const formatMoney = (val) => {
    if (val === null || val === undefined) return '$0.00';
    return `$${parseFloat(val).toFixed(2)}`;
  };

  const closePosition = async (symbol) => {
    try {
      await tradingAPI.closePosition(symbol);
      setPositions(prev => prev.filter(p => p.coin !== symbol));
    } catch (err) {
      console.error('Erreur fermeture position:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-1">
              Bienvenue sur <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">HyperBot</span>
            </h2>
            <p className="text-muted-foreground">Votre assistant de trading intelligent propulsé par l'IA</p>
          </div>
          <img 
            src="https://illustrations.popsy.co/violet/digital-nomad.svg" 
            alt="Trading" 
            className="w-32 h-32 hidden sm:block"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bot Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4 inline mr-2" />
              Statut du Bot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                status?.isRunning 
                  ? 'bg-success/20 text-success' 
                  : 'bg-destructive/20 text-destructive'
              }`}>
                {status?.isRunning ? 'EN COURS' : 'ARRÊTÉ'}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium">{status?.mode || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Symbole</span>
                <span className="font-medium">{status?.symbol || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Analyses</span>
                <span className="font-medium">{status?.analysisCount || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Balance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <Wallet className="w-4 h-4 inline mr-2" />
              Compte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(balance?.equity)}</div>
            <p className="text-xs text-muted-foreground">Équité totale</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marge libre</span>
                <span className="font-medium">{formatMoney(balance?.freeMargin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PnL non réalisé</span>
                <span className={`font-medium ${(balance?.unrealizedPnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatMoney(balance?.unrealizedPnl)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <BarChart2 className="w-4 h-4 inline mr-2" />
              Stats du Jour
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold">{stats?.todayTrades || 0}</div>
                <p className="text-xs text-muted-foreground">Trades</p>
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.winRate?.toFixed(0) || 0}%</div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
              </div>
            </div>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted-foreground">PnL</span>
              <span className={`font-medium ${(stats?.todayPnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                {(stats?.todayPnl || 0) >= 0 ? '+' : ''}{formatMoney(stats?.todayPnl)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-success" />
                  <span className="text-sm">Wins</span>
                </div>
                <span className="font-medium">{stats?.wins || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <span className="text-sm">Losses</span>
                </div>
                <span className="font-medium">{stats?.losses || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit Factor</span>
                <span className="font-medium">{stats?.profitFactor?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Positions & Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Positions */}
        <Card>
          <CardHeader>
            <CardTitle>Positions Ouvertes ({positions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Wallet className="w-12 h-12 mb-3 opacity-50" />
                <p>Aucune position ouverte</p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">{pos.coin}</div>
                      <div className={`text-sm ${parseFloat(pos.szi) > 0 ? 'text-success' : 'text-destructive'}`}>
                        {parseFloat(pos.szi) > 0 ? 'LONG' : 'SHORT'} • {Math.abs(parseFloat(pos.szi)).toFixed(4)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${parseFloat(pos.unrealizedPnl) >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {parseFloat(pos.unrealizedPnl) >= 0 ? '+' : ''}{formatMoney(pos.unrealizedPnl)}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => closePosition(pos.coin)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Logs en Temps Réel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 overflow-y-auto space-y-1 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="p-2 rounded bg-muted/50">
                  <span className="text-muted-foreground">[--:--:--]</span>
                  <span className="ml-2">En attente de logs...</span>
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`p-1.5 rounded ${
                    log.level === 'error' ? 'bg-destructive/10 text-destructive' :
                    log.level === 'warn' ? 'bg-warning/10 text-warning' :
                    log.level === 'success' ? 'bg-success/10 text-success' :
                    'bg-muted/50'
                  }`}>
                    <span className="text-muted-foreground">[{formatTime(log.timestamp)}]</span>
                    <span className="ml-2">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
