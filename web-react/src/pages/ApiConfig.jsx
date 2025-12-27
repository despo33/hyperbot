import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Key, Eye, EyeOff, Shield, CheckCircle, XCircle, Save, Trash2, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { walletAPI } from '@/services/api';

export function ApiConfig() {
  const [showSecret, setShowSecret] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [activeWalletId, setActiveWalletId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [config, setConfig] = useState({
    secretPhrase: '',
    tradingAddress: '',
    walletName: '',
  });

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      setLoading(true);
      const data = await walletAPI.getAll();
      if (data.wallets) {
        setWallets(data.wallets);
        const active = data.wallets.find(w => w.isActive);
        if (active) setActiveWalletId(active._id);
      }
    } catch (err) {
      console.log('Pas de wallets configurés');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setError(null);
      const result = await walletAPI.testConnection();
      if (result.success) {
        setSuccess('Connexion réussie !');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || 'Échec de la connexion');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!config.secretPhrase) {
      setError('La phrase secrète est requise');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await walletAPI.add({
        secretPhrase: config.secretPhrase,
        tradingAddress: config.tradingAddress,
        walletName: config.walletName || 'Mon Wallet',
      });
      setSuccess('Wallet ajouté avec succès !');
      setConfig({ secretPhrase: '', tradingAddress: '', walletName: '' });
      loadWallets();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (walletId) => {
    try {
      await walletAPI.setActive(walletId);
      setActiveWalletId(walletId);
      loadWallets();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (walletId) => {
    if (!confirm('Supprimer ce wallet ?')) return;
    try {
      await walletAPI.delete(walletId);
      loadWallets();
    } catch (err) {
      setError(err.message);
    }
  };

  const activeWallet = wallets.find(w => w.isActive);
  const isConnected = !!activeWallet;

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

      {/* Warning */}
      <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-warning">Important - Sécurité</p>
          <p className="text-sm text-muted-foreground mt-1">
            Vos clés API sont chiffrées et stockées dans votre compte. Ne partagez jamais vos clés secrètes.
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
                Connecté - {activeWallet?.name} ({activeWallet?.address?.slice(0, 10)}...)
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

      {/* Wallets List */}
      {wallets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wallets configurés ({wallets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {wallets.map((wallet) => (
                <div key={wallet._id} className={`flex items-center justify-between p-3 rounded-lg border ${wallet.isActive ? 'border-success bg-success/5' : 'bg-muted/30'}`}>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {wallet.name}
                      {wallet.isActive && <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">Actif</span>}
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">{wallet.address}</div>
                  </div>
                  <div className="flex gap-2">
                    {!wallet.isActive && (
                      <Button size="sm" variant="outline" onClick={() => handleSetActive(wallet._id)}>
                        Activer
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(wallet._id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add New Wallet */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Plus className="w-5 h-5" />
            Ajouter un Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nom du Wallet</label>
            <input
              type="text"
              value={config.walletName}
              onChange={(e) => setConfig(prev => ({ ...prev, walletName: e.target.value }))}
              placeholder="Mon Wallet Principal"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Phrase Secrète / Clé Privée</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={config.secretPhrase}
                onChange={(e) => setConfig(prev => ({ ...prev, secretPhrase: e.target.value }))}
                placeholder="Votre seed phrase ou clé privée (0x...)"
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Adresse de Trading (optionnel)</label>
            <input
              type="text"
              value={config.tradingAddress}
              onChange={(e) => setConfig(prev => ({ ...prev, tradingAddress: e.target.value }))}
              placeholder="0x... (si différente de l'adresse principale)"
              className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Ajout...' : 'Ajouter le Wallet'}
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !isConnected}>
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Tester la connexion
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
