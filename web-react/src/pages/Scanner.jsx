import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scan, Play, Square, TrendingUp, TrendingDown, Clock, Target, Filter } from 'lucide-react';

const mockResults = [
  { symbol: 'BTC', score: 8, direction: 'LONG', winProb: 72, timeframe: '15m', strategy: 'Ichimoku' },
  { symbol: 'ETH', score: 7, direction: 'LONG', winProb: 68, timeframe: '1h', strategy: 'SMC' },
  { symbol: 'SOL', score: 6, direction: 'SHORT', winProb: 65, timeframe: '15m', strategy: 'Ichimoku' },
  { symbol: 'DOGE', score: 5, direction: 'LONG', winProb: 61, timeframe: '4h', strategy: 'Bollinger' },
];

export function Scanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState(mockResults);
  const [filters, setFilters] = useState({
    minScore: 5,
    direction: 'all',
    timeframe: 'all',
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Scan className="w-5 h-5" />
            Scanner Multi-Crypto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant={isScanning ? 'destructive' : 'default'}
              onClick={() => setIsScanning(!isScanning)}
            >
              {isScanning ? (
                <>
                  <Square className="w-4 h-4" />
                  Arrêter
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Démarrer le scan
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={filters.direction}
                onChange={(e) => setFilters(prev => ({ ...prev, direction: e.target.value }))}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              >
                <option value="all">Toutes directions</option>
                <option value="LONG">LONG uniquement</option>
                <option value="SHORT">SHORT uniquement</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <select
                value={filters.minScore}
                onChange={(e) => setFilters(prev => ({ ...prev, minScore: parseInt(e.target.value) }))}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              >
                {[3, 4, 5, 6, 7, 8].map(s => (
                  <option key={s} value={s}>Score min: {s}</option>
                ))}
              </select>
            </div>

            {isScanning && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                Scan en cours...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Résultats ({results.length} opportunités)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Symbole</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Direction</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Win Prob</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Timeframe</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Stratégie</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {results
                  .filter(r => filters.direction === 'all' || r.direction === filters.direction)
                  .filter(r => r.score >= filters.minScore)
                  .map((result, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{result.symbol}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          result.direction === 'LONG' 
                            ? 'bg-success/20 text-success' 
                            : 'bg-destructive/20 text-destructive'
                        }`}>
                          {result.direction === 'LONG' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {result.direction}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-primary">{result.score}/10</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-success font-medium">{result.winProb}%</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Clock className="w-3 h-3" />
                          {result.timeframe}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">{result.strategy}</td>
                      <td className="py-3 px-4">
                        <Button size="sm" variant="outline">Trader</Button>
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
