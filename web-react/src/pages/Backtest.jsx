import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FlaskConical, Play, Calendar, TrendingUp, TrendingDown, BarChart2, Percent } from 'lucide-react';

export function Backtest() {
  const [config, setConfig] = useState({
    symbol: 'BTC',
    timeframe: '15m',
    strategy: 'ichimoku',
    startDate: '2024-01-01',
    endDate: '2024-12-27',
    initialCapital: 10000,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);

  const mockResults = {
    totalTrades: 156,
    winRate: 62.8,
    profitFactor: 1.85,
    maxDrawdown: 8.5,
    totalReturn: 45.2,
    sharpeRatio: 1.42,
    wins: 98,
    losses: 58,
    avgWin: 2.1,
    avgLoss: -1.2,
  };

  const runBacktest = () => {
    setIsRunning(true);
    setTimeout(() => {
      setResults(mockResults);
      setIsRunning(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>
            <FlaskConical className="w-5 h-5" />
            Configuration du Backtest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Symbole</label>
              <input
                type="text"
                value={config.symbol}
                onChange={(e) => setConfig(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Timeframe</label>
              <select
                value={config.timeframe}
                onChange={(e) => setConfig(prev => ({ ...prev, timeframe: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              >
                {['5m', '15m', '30m', '1h', '4h', '1d'].map(tf => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stratégie</label>
              <select
                value={config.strategy}
                onChange={(e) => setConfig(prev => ({ ...prev, strategy: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              >
                <option value="ichimoku">Ichimoku</option>
                <option value="smc">Smart Money</option>
                <option value="bollinger">Bollinger</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Début
              </label>
              <input
                type="date"
                value={config.startDate}
                onChange={(e) => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Fin
              </label>
              <input
                type="date"
                value={config.endDate}
                onChange={(e) => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Capital ($)</label>
              <input
                type="number"
                value={config.initialCapital}
                onChange={(e) => setConfig(prev => ({ ...prev, initialCapital: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>
          </div>
          <div className="mt-6">
            <Button onClick={runBacktest} disabled={isRunning}>
              <Play className="w-4 h-4" />
              {isRunning ? 'Backtest en cours...' : 'Lancer le Backtest'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{results.totalTrades}</p>
                <p className="text-sm text-muted-foreground">Total Trades</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-success">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-success">{results.winRate}%</p>
                <p className="text-sm text-muted-foreground">Win Rate</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{results.profitFactor}</p>
                <p className="text-sm text-muted-foreground">Profit Factor</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-destructive">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-destructive">{results.maxDrawdown}%</p>
                <p className="text-sm text-muted-foreground">Max Drawdown</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-success">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-success">+{results.totalReturn}%</p>
                <p className="text-sm text-muted-foreground">Rendement</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{results.sharpeRatio}</p>
                <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                <BarChart2 className="w-5 h-5" />
                Détails des Résultats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-success" />
                    <span className="font-medium">Trades Gagnants</span>
                  </div>
                  <p className="text-3xl font-bold text-success">{results.wins}</p>
                  <p className="text-sm text-muted-foreground">Gain moyen: +{results.avgWin}%</p>
                </div>
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-5 h-5 text-destructive" />
                    <span className="font-medium">Trades Perdants</span>
                  </div>
                  <p className="text-3xl font-bold text-destructive">{results.losses}</p>
                  <p className="text-sm text-muted-foreground">Perte moyenne: {results.avgLoss}%</p>
                </div>
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Percent className="w-5 h-5 text-primary" />
                    <span className="font-medium">Capital Final</span>
                  </div>
                  <p className="text-3xl font-bold text-primary">
                    ${(config.initialCapital * (1 + results.totalReturn / 100)).toFixed(0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Initial: ${config.initialCapital}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted border">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart2 className="w-5 h-5" />
                    <span className="font-medium">Ratio W/L</span>
                  </div>
                  <p className="text-3xl font-bold">{(results.wins / results.losses).toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">{results.wins} / {results.losses}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
