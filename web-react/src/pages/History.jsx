import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History as HistoryIcon, TrendingUp, TrendingDown, Calendar, Download, Filter } from 'lucide-react';

const mockTrades = [
  { id: 1, symbol: 'BTC', direction: 'LONG', entry: 42150, exit: 43200, pnl: 125.50, pnlPercent: 2.49, date: '2024-12-27 10:30', duration: '2h 15m' },
  { id: 2, symbol: 'ETH', direction: 'SHORT', entry: 2280, exit: 2320, pnl: -45.20, pnlPercent: -1.75, date: '2024-12-27 08:15', duration: '45m' },
  { id: 3, symbol: 'SOL', direction: 'LONG', entry: 98.50, exit: 102.30, pnl: 78.90, pnlPercent: 3.86, date: '2024-12-26 16:00', duration: '4h 30m' },
  { id: 4, symbol: 'BTC', direction: 'LONG', entry: 41800, exit: 42150, pnl: 52.30, pnlPercent: 0.84, date: '2024-12-26 12:00', duration: '1h 20m' },
  { id: 5, symbol: 'DOGE', direction: 'SHORT', entry: 0.092, exit: 0.088, pnl: 35.60, pnlPercent: 4.35, date: '2024-12-25 20:00', duration: '3h' },
];

export function History() {
  const [trades] = useState(mockTrades);
  const [filter, setFilter] = useState('all');

  const stats = {
    totalTrades: trades.length,
    wins: trades.filter(t => t.pnl > 0).length,
    losses: trades.filter(t => t.pnl < 0).length,
    totalPnl: trades.reduce((sum, t) => sum + t.pnl, 0),
    winRate: (trades.filter(t => t.pnl > 0).length / trades.length * 100).toFixed(1),
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{stats.totalTrades}</p>
            <p className="text-sm text-muted-foreground">Total Trades</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-success">{stats.wins}</p>
            <p className="text-sm text-muted-foreground">Gagnants</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.losses}</p>
            <p className="text-sm text-muted-foreground">Perdants</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-primary">{stats.winRate}%</p>
            <p className="text-sm text-muted-foreground">Win Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground">PnL Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Trades Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            <HistoryIcon className="w-5 h-5" />
            Historique des Trades
          </CardTitle>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border bg-background text-sm"
            >
              <option value="all">Tous</option>
              <option value="wins">Gagnants</option>
              <option value="losses">Perdants</option>
            </select>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4" />
              Exporter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Symbole</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Direction</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Entrée</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Sortie</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Durée</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">PnL</th>
                </tr>
              </thead>
              <tbody>
                {trades
                  .filter(t => filter === 'all' || (filter === 'wins' && t.pnl > 0) || (filter === 'losses' && t.pnl < 0))
                  .map((trade) => (
                    <tr key={trade.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          {trade.date}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">{trade.symbol}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          trade.direction === 'LONG' 
                            ? 'bg-success/20 text-success' 
                            : 'bg-destructive/20 text-destructive'
                        }`}>
                          {trade.direction === 'LONG' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {trade.direction}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm">${trade.entry}</td>
                      <td className="py-3 px-4 font-mono text-sm">${trade.exit}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">{trade.duration}</td>
                      <td className="py-3 px-4">
                        <div className={`font-medium ${trade.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                          <span className="text-xs ml-1">({trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent}%)</span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
