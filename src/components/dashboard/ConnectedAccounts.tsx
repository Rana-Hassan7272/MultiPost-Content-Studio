import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Youtube, Instagram, Video, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { getYouTubeAuthUrl } from '../../services/youtubeService';

interface ConnectedAccount {
  id: string;
  platform: 'youtube' | 'instagram' | 'tiktok';
  account_name: string;
  account_id: string;
  is_active: boolean;
  created_at: string;
}

export function ConnectedAccounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, [user]);

  const loadAccounts = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (platform: string) => {
    if (platform === 'youtube') {
      try {
        const authUrl = await getYouTubeAuthUrl();
        window.location.href = authUrl;
      } catch (error) {
        console.error('Error connecting YouTube:', error);
        alert('Erreur lors de la connexion à YouTube');
      }
    } else {
      setShowAddModal(true);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir déconnecter ce compte ?')) return;

    try {
      const { error } = await supabase
        .from('connected_accounts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setAccounts(accounts.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error disconnecting account:', error);
    }
  };

  const platforms = [
    {
      id: 'youtube',
      name: 'YouTube',
      icon: Youtube,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: Instagram,
      color: 'text-pink-500',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      icon: Video,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Comptes connectés</h1>
          <p className="text-slate-600 mt-2">Gérez vos connexions aux plateformes sociales</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500 rounded-lg">
            <Plus className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">Connexion aux réseaux sociaux</h3>
            <p className="text-sm text-slate-600 mt-1">
              L'intégration OAuth avec les plateformes nécessite une configuration API. Utilisez les boutons ci-dessous pour simuler des connexions.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {platforms.map((platform) => {
          const Icon = platform.icon;
          const connectedAccount = accounts.find(a => a.platform === platform.id);

          return (
            <div
              key={platform.id}
              className={`bg-white rounded-xl border-2 ${
                connectedAccount ? platform.borderColor : 'border-slate-200'
              } overflow-hidden hover:shadow-lg transition`}
            >
              <div className={`${platform.bgColor} p-6 border-b ${platform.borderColor}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-8 h-8 ${platform.color}`} />
                    <div>
                      <h3 className="font-semibold text-slate-900">{platform.name}</h3>
                      {connectedAccount && (
                        <p className="text-sm text-slate-600 mt-0.5">
                          @{connectedAccount.account_name}
                        </p>
                      )}
                    </div>
                  </div>
                  {connectedAccount && (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  )}
                </div>
              </div>

              <div className="p-6 space-y-4">
                {connectedAccount ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-600">Status:</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        connectedAccount.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {connectedAccount.is_active ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Actif
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            Inactif
                          </>
                        )}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      Connecté le {new Date(connectedAccount.created_at).toLocaleDateString('fr-FR')}
                    </div>
                    <button
                      onClick={() => handleDisconnect(connectedAccount.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                      Déconnecter
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      Connectez votre compte {platform.name} pour publier du contenu automatiquement.
                    </p>
                    <button
                      onClick={() => handleConnect(platform.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 transition"
                    >
                      <Plus className="w-4 h-4" />
                      Connecter
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {accounts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-900">Tous les comptes</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {accounts.map((account) => {
              const platform = platforms.find(p => p.id === account.platform);
              if (!platform) return null;
              const Icon = platform.icon;

              return (
                <div key={account.id} className="p-6 hover:bg-slate-50 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 ${platform.bgColor} rounded-lg`}>
                        <Icon className={`w-6 h-6 ${platform.color}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{platform.name}</h3>
                        <p className="text-sm text-slate-600">@{account.account_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                        account.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {account.is_active ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Actif
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            Inactif
                          </>
                        )}
                      </span>
                      <button
                        onClick={() => handleDisconnect(account.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Information</h3>
            <p className="text-slate-600">
              La connexion OAuth complète nécessite la configuration des APIs des plateformes sociales (YouTube Data API, Instagram Graph API, TikTok API).
            </p>
            <p className="text-sm text-slate-500">
              Cette fonctionnalité est prête à être intégrée une fois que vous aurez configuré vos clés API.
            </p>
            <button
              onClick={() => setShowAddModal(false)}
              className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
