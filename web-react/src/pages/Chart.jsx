import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Settings } from 'lucide-react';

export function Chart() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('15');
  const containerRef = useRef(null);

  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT', 'ADAUSDT'];
  const intervals = [
    { value: '1', label: '1m' },
    { value: '5', label: '5m' },
    { value: '15', label: '15m' },
    { value: '30', label: '30m' },
    { value: '60', label: '1h' },
    { value: '240', label: '4h' },
    { value: 'D', label: '1D' },
  ];

  useEffect(() => {
    if (containerRef.current && window.TradingView) {
      containerRef.current.innerHTML = '';
      new window.TradingView.widget({
        autosize: true,
        symbol: `BINANCE:${symbol}`,
        interval: interval,
        timezone: 'Europe/Paris',
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        style: '1',
        locale: 'fr',
        toolbar_bg: '#f1f3f6',
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        container_id: 'tradingview_chart',
        studies: ['IchimokuCloud@tv-basicstudies'],
      });
    }
  }, [symbol, interval]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            <Settings className="w-4 h-4" />
            Configuration du graphique
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Symbole:</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="px-3 py-2 rounded-lg border bg-background"
              >
                {symbols.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Intervalle:</label>
              <div className="flex gap-1">
                {intervals.map(i => (
                  <button
                    key={i.value}
                    onClick={() => setInterval(i.value)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      interval === i.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            <LineChart className="w-5 h-5" />
            {symbol} - Graphique TradingView
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div 
            id="tradingview_chart" 
            ref={containerRef}
            className="h-[600px] w-full"
          >
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <LineChart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Chargement du graphique TradingView...</p>
                <p className="text-sm mt-2">Assurez-vous que le script TradingView est chargé</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
