import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Key, Eye, EyeOff, Shield, CheckCircle, XCircle, Save, Trash2, AlertTriangle } from 'lucide-react';

export function ApiConfig() {
  const [showSecret, setShowSecret] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [config, setConfig] = useState({
    apiKey: '',
    apiSecret: '',
    walletAddress: '',
    testnet: true,
  });

  const handleTest = () => {
    if (config.apiKey && config.apiSecret) {
      setIsConnected(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning */}
      <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-warning">Important - Sécurité</p>
          <p className="text-sm text-muted-foreground mt-1">
            Vos clés API sont chiffrées et stockées localement. Ne partagez jamais vos clés secrètes.
            Utilisez des clés avec des permissions limitées (trading uniquement, pas de retrait).
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <Card className={isConnected ? 'border-success/50' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Statut de Connexion
            </span>
            {isConnected ? (
              <span className="flex items-center gap-2 text-success text-sm font-normal">
                <CheckCircle className="w-4 h-4" />
                Connecté à Hyperliquid
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground text-sm font-normal">
                <XCircle className="w-4 h-4" />
                Non connecté
              </span>
            )}
          </CardTitle>
        </CardHeader>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Key className="w-5 h-5" />
            Clés API Hyperliquid
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Adresse du Wallet</label>
            <input
              type="text"
              value={config.walletAddress}
              onChange={(e) => setConfig(prev => ({ ...prev, walletAddress: e.target.value }))}
              placeholder="0x..."
              className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Clé API</label>
            <input
              type="text"
              value={config.apiKey}
              onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="Votre clé API"
              className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Clé Secrète</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={config.apiSecret}
                onChange={(e) => setConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                placeholder="Votre clé secrète"
                className="w-full px-3 py-2 pr-10 rounded-lg border bg-background font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <input
              type="checkbox"
              id="testnet"
              checked={config.testnet}
              onChange={(e) => setConfig(prev => ({ ...prev, testnet: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="testnet" className="cursor-pointer">
              <span className="font-medium">Mode Testnet</span>
              <p className="text-sm text-muted-foreground">Utiliser le réseau de test (recommandé pour débuter)</p>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleTest}>
              <CheckCircle className="w-4 h-4" />
              Tester la connexion
            </Button>
            <Button variant="outline">
              <Save className="w-4 h-4" />
              Sauvegarder
            </Button>
            <Button variant="destructive" className="ml-auto">
              <Trash2 className="w-4 h-4" />
              Supprimer les clés
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Comment obtenir vos clés API</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Connectez-vous à <a href="https://app.hyperliquid.xyz" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">app.hyperliquid.xyz</a></li>
            <li>Allez dans Settings → API</li>
            <li>Créez une nouvelle clé API avec les permissions "Trading"</li>
            <li>Copiez la clé API et la clé secrète</li>
            <li>Collez-les dans les champs ci-dessus</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
