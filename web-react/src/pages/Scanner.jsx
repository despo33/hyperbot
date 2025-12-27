import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scan, Play, Square, TrendingUp, TrendingDown, Clock, Target, Filter, RefreshCw } from 'lucide-react';
import { scannerAPI } from '@/services/api';

export function Scanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    minScore: 5,
    direction: 'all',
    timeframe: '1h',
    strategy: 'ichimoku',
  });

  // Charge les résultats existants au démarrage
  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    try {
      const data = await scannerAPI.getResults();
      if (data.results) {
        setResults(data.results);
        setSummary(data.summary);
      }
    } catch (err) {
      console.log('Pas de résultats existants');
    }
  };

  const runScan = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await scannerAPI.scan(filters.timeframe, filters.strategy);
      if (data.results) {
        setResults(data.results);
        setSummary(data.summary);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startAutoScan = async () => {
    try {
      await scannerAPI.startAutoScan(300000, filters.timeframe);
      setIsScanning(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const stopAutoScan = async () => {
    try {
      await scannerAPI.stopAutoScan();
      setIsScanning(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredResults = results.filter(r => {
    if (filters.direction !== 'all' && r.direction?.toUpperCase() !== filters.direction) return false;
    if ((r.score || 0) < filters.minScore) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

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
            <Button onClick={runScan} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Scan en cours...' : 'Scanner maintenant'}
            </Button>

            <Button
              variant={isScanning ? 'destructive' : 'outline'}
              onClick={isScanning ? stopAutoScan : startAutoScan}
            >
              {isScanning ? (
                <>
                  <Square className="w-4 h-4" />
                  Arrêter auto-scan
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Auto-scan (5min)
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <select
                value={filters.timeframe}
                onChange={(e) => setFilters(prev => ({ ...prev, timeframe: e.target.value }))}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              >
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
              </select>
            </div>

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
                Auto-scan actif
              </div>
            )}
          </div>

          {summary && (
            <div className="mt-4 flex gap-4 text-sm">
              <span className="text-muted-foreground">Total: <strong>{summary.total || 0}</strong></span>
              <span className="text-success">Bullish: <strong>{summary.bullish || 0}</strong></span>
              <span className="text-destructive">Bearish: <strong>{summary.bearish || 0}</strong></span>
              <span className="text-muted-foreground">Neutral: <strong>{summary.neutral || 0}</strong></span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Résultats ({filteredResults.length} opportunités)</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Scan className="w-12 h-12 mb-3 opacity-50" />
              <p>Aucun résultat. Lancez un scan pour analyser les cryptos.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Symbole</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Direction</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Score</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Win Prob</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Prix</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Confiance</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((result, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{result.symbol}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          result.direction?.toUpperCase() === 'LONG' 
                            ? 'bg-success/20 text-success' 
                            : result.direction?.toUpperCase() === 'SHORT'
                            ? 'bg-destructive/20 text-destructive'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {result.direction?.toUpperCase() === 'LONG' ? <TrendingUp className="w-3 h-3" /> : 
                           result.direction?.toUpperCase() === 'SHORT' ? <TrendingDown className="w-3 h-3" /> : null}
                          {result.direction?.toUpperCase() || 'NEUTRAL'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-primary">{result.score || 0}/10</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-success font-medium">{result.winProbability?.toFixed(0) || 0}%</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm">
                        ${result.price?.toLocaleString() || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full" 
                            style={{ width: `${result.confidence || 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Button size="sm" variant="outline" disabled={!result.direction || result.direction === 'neutral'}>
                          Trader
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
