import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Wallet, Percent, AlertTriangle, TrendingDown, Lock, Save } from 'lucide-react';

export function Risk() {
  const [config, setConfig] = useState({
    maxPositionSize: 5,
    maxDailyLoss: 3,
    maxOpenPositions: 3,
    trailingStop: true,
    trailingStopPercent: 1,
    breakEvenAfter: 1.5,
    maxLeverage: 10,
    riskPerTrade: 2,
  });

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Risk Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-success">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Capital à risque</p>
                <p className="text-2xl font-bold">{config.riskPerTrade}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Perte max/jour</p>
                <p className="text-2xl font-bold">{config.maxDailyLoss}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Lock className="w-8 h-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Positions max</p>
                <p className="text-2xl font-bold">{config.maxOpenPositions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-sm text-muted-foreground">Levier max</p>
                <p className="text-2xl font-bold">{config.maxLeverage}x</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Settings */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Shield className="w-5 h-5" />
            Paramètres de Gestion des Risques
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Percent className="w-4 h-4 text-primary" />
                Risque par trade (%)
              </label>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={config.riskPerTrade}
                onChange={(e) => handleChange('riskPerTrade', parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="text-center text-lg font-bold text-primary">{config.riskPerTrade}%</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Wallet className="w-4 h-4 text-success" />
                Taille position max (%)
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={config.maxPositionSize}
                onChange={(e) => handleChange('maxPositionSize', parseInt(e.target.value))}
                className="w-full accent-success"
              />
              <div className="text-center text-lg font-bold text-success">{config.maxPositionSize}%</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Perte max journalière (%)
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={config.maxDailyLoss}
                onChange={(e) => handleChange('maxDailyLoss', parseInt(e.target.value))}
                className="w-full accent-warning"
              />
              <div className="text-center text-lg font-bold text-warning">{config.maxDailyLoss}%</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Positions ouvertes max</label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.maxOpenPositions}
                onChange={(e) => handleChange('maxOpenPositions', parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Levier maximum</label>
              <input
                type="range"
                min="1"
                max="20"
                value={config.maxLeverage}
                onChange={(e) => handleChange('maxLeverage', parseInt(e.target.value))}
                className="w-full accent-destructive"
              />
              <div className="text-center text-lg font-bold text-destructive">{config.maxLeverage}x</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Break-even après (%)</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="5"
                value={config.breakEvenAfter}
                onChange={(e) => handleChange('breakEvenAfter', parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border bg-background"
              />
            </div>
          </div>

          {/* Trailing Stop */}
          <div className="mt-6 p-4 rounded-lg border bg-muted/30">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.trailingStop}
                onChange={(e) => handleChange('trailingStop', e.target.checked)}
                className="w-5 h-5 accent-primary"
              />
              <div>
                <span className="font-medium">Trailing Stop</span>
                <p className="text-sm text-muted-foreground">Ajuste automatiquement le stop-loss pour protéger les gains</p>
              </div>
            </label>
            {config.trailingStop && (
              <div className="mt-4 ml-8">
                <label className="text-sm font-medium">Distance trailing (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="5"
                  value={config.trailingStopPercent}
                  onChange={(e) => handleChange('trailingStopPercent', parseFloat(e.target.value))}
                  className="w-32 ml-3 px-3 py-1 rounded-lg border bg-background"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>
          <Save className="w-4 h-4" />
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
