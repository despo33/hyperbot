import { Activity, Wallet, BarChart2, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function Dashboard() {
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
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/20 text-destructive">
                ARRÊTÉ
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Symbole</span>
                <span className="font-medium">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Analyses</span>
                <span className="font-medium">0</span>
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
            <div className="text-2xl font-bold">$0.00</div>
            <p className="text-xs text-muted-foreground">Équité totale</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Marge libre</span>
                <span className="font-medium">$0.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PnL non réalisé</span>
                <span className="font-medium">$0.00</span>
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
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">Trades</p>
              </div>
              <div>
                <div className="text-2xl font-bold">0%</div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
              </div>
            </div>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted-foreground">PnL</span>
              <span className="font-medium text-success">+$0.00</span>
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
                <span className="font-medium">0</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <span className="text-sm">Losses</span>
                </div>
                <span className="font-medium">0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit Factor</span>
                <span className="font-medium">0.00</span>
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
            <CardTitle>Positions Ouvertes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Wallet className="w-12 h-12 mb-3 opacity-50" />
              <p>Aucune position ouverte</p>
            </div>
          </CardContent>
        </Card>

        {/* Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Logs en Temps Réel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 overflow-y-auto space-y-2 font-mono text-xs">
              <div className="p-2 rounded bg-muted/50">
                <span className="text-muted-foreground">[12:00:00]</span>
                <span className="ml-2">En attente de logs...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
