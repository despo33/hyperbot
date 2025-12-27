import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CandlestickChart, Settings, TrendingUp, Clock, Target, Percent, Layers, Save, RefreshCw } from 'lucide-react';
import { tradingAPI } from '@/services/api';

export function Trading() {
  const [config, setConfig] = useState({
    symbols: ['BTC'],
    timeframes: ['15m'],
    strategy: 'ichimoku',
    mode: 'multi',
    minScore: 5,
    minWinProbability: 60,
    defaultTP: 2.5,
    defaultSL: 1.5,
    leverage: 5,
    analysisInterval: 60,
    enabledSignals: {
      tkCross: true,
      kumoBreakout: true,
      kijunBounce: true,
      chikouConfirm: true,
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const timeframeOptions = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  const strategies = [
    { value: 'ichimoku', label: 'Ichimoku' },
    { value: 'smc', label: 'Smart Money Concepts' },
    { value: 'bollinger', label: 'Bollinger Squeeze' },
  ];

  // Charge la config au démarrage
  useEffect(() => {
    async function loadConfig() {
      try {
        const data = await tradingAPI.getConfig();
        if (data.config) {
          setConfig(prev => ({ ...prev, ...data.config }));
        }
      } catch (err) {
        console.log('Config par défaut utilisée');
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setSuccess(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await tradingAPI.saveConfig(config);
      setSuccess('Configuration sauvegardée !');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      const data = await tradingAPI.getConfig();
      if (data.config) {
        setConfig(prev => ({ ...prev, ...data.config }));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-success/10 border border-success/30 text-success">
          {success}
        </div>
      )}

      {/* Mode & Stratégie */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              <CandlestickChart className="w-4 h-4" />
              Symboles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="text"
              value={Array.isArray(config.symbols) ? config.symbols.join(', ') : config.symbols}
              onChange={(e) => handleChange('symbols', e.target.value.toUpperCase().split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="BTC, ETH, SOL..."
            />
            <p className="text-xs text-muted-foreground mt-1">Séparez par des virgules</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              <Clock className="w-4 h-4" />
              Timeframe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {timeframes.map(tf => (
                <button
                  key={tf}
                  onClick={() => handleChange('timeframe', tf)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    config.timeframe === tf
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              <Layers className="w-4 h-4" />
              Stratégie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={config.strategy}
              onChange={(e) => handleChange('strategy', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground focus:ring-2 focus:ring-primary"
            >
              {strategies.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>

      {/* Paramètres de Trading */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Settings className="w-5 h-5" />
            Paramètres de Trading
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Min Score */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Score Minimum
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={config.minScore}
                onChange={(e) => handleChange('minScore', parseInt(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="text-center text-lg font-bold text-primary">{config.minScore}</div>
            </div>

            {/* Win Probability */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Percent className="w-4 h-4 text-success" />
                Win Probability Min
              </label>
              <input
                type="range"
                min="50"
                max="90"
                step="5"
                value={config.minWinProbability}
                onChange={(e) => handleChange('minWinProbability', parseInt(e.target.value))}
                className="w-full accent-success"
              />
              <div className="text-center text-lg font-bold text-success">{config.minWinProbability}%</div>
            </div>

            {/* Take Profit */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                Take Profit (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="20"
                value={config.takeProfit}
                onChange={(e) => handleChange('takeProfit', parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border bg-background text-foreground focus:ring-2 focus:ring-success"
              />
            </div>

            {/* Stop Loss */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-destructive rotate-180" />
                Stop Loss (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="10"
                value={config.stopLoss}
                onChange={(e) => handleChange('stopLoss', parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border bg-background text-foreground focus:ring-2 focus:ring-destructive"
              />
            </div>

            {/* Leverage */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Levier</label>
              <input
                type="range"
                min="1"
                max="20"
                value={config.leverage}
                onChange={(e) => handleChange('leverage', parseInt(e.target.value))}
                className="w-full accent-warning"
              />
              <div className="text-center text-lg font-bold text-warning">{config.leverage}x</div>
            </div>

            {/* Analysis Interval */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Intervalle d'analyse (sec)
              </label>
              <input
                type="number"
                min="30"
                max="300"
                step="10"
                value={config.analysisInterval}
                onChange={(e) => handleChange('analysisInterval', parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border bg-background text-foreground"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signaux Ichimoku */}
      {config.strategy === 'ichimoku' && (
        <Card>
          <CardHeader>
            <CardTitle>Signaux Ichimoku Activés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries({
                tkCross: 'TK Cross',
                kumoBreakout: 'Kumo Breakout',
                kijunBounce: 'Kijun Bounce',
                chikouConfirm: 'Chikou Confirm',
              }).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
                  <input
                    type="checkbox"
                    checked={config.enabledSignals[key]}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      enabledSignals: { ...prev.enabledSignals, [key]: e.target.checked }
                    }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset}>Réinitialiser</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  );
}
