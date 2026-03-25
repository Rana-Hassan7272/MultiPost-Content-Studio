import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { getVoiceProfiles, createVoiceProfile, updateVoiceProfile, type VoiceProfile } from '../../services/voiceProfileService';
import { Save, Plus } from 'lucide-react';
import { UpgradeModal } from '../UpgradeModal';

export function VoiceProfileSettings() {
  const { user } = useAuth();
  const { isAtLimit } = useSubscription();
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<VoiceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const atVoiceLimit = isAtLimit('voiceProfiles');

  const [formData, setFormData] = useState({
    name: '',
    tone_style: [] as string[],
    emoji_usage: 'moderate' as 'heavy' | 'moderate' | 'minimal',
    language_style: [] as string[],
    include_slang: true,
    avoid_cringe_hashtags: false,
    use_trending_hashtags: true,
    include_artist_name: true,
    brand_guidelines: {} as Record<string, any>,
    content_focus: '',
    preferred_genres: [] as string[],
  });

  const toneOptions = ['energetic', 'professional', 'casual', 'minimal', 'humorous', 'serious'];
  const languageOptions = ['english', 'french', 'spanish', 'slang', 'formal'];

  useEffect(() => {
    loadProfiles();
  }, [user]);

  const loadProfiles = async () => {
    if (!user) return;
    try {
      const data = await getVoiceProfiles();
      setProfiles(data);
      if (data.length > 0 && !selectedProfile) {
        setSelectedProfile(data[0]);
        loadProfileData(data[0]);
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const loadProfileData = (profile: VoiceProfile) => {
    setFormData({
      name: profile.name,
      tone_style: profile.tone_style || [],
      emoji_usage: profile.emoji_usage,
      language_style: profile.language_style || [],
      include_slang: profile.include_slang,
      avoid_cringe_hashtags: profile.avoid_cringe_hashtags,
      use_trending_hashtags: profile.use_trending_hashtags,
      include_artist_name: profile.include_artist_name,
      brand_guidelines: profile.brand_guidelines || {},
      content_focus: profile.content_focus || '',
      preferred_genres: profile.preferred_genres || [],
    });
  };

  const handleSave = async () => {
    if (!user || !formData.name.trim()) {
      setMessage({ type: 'error', text: 'Le nom du profil est requis' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (selectedProfile && !isCreating) {
        await updateVoiceProfile(selectedProfile.id, formData);
        setMessage({ type: 'success', text: 'Profil mis à jour avec succès' });
      } else {
        if (atVoiceLimit) {
          setMessage({ type: 'error', text: 'Voice profile limit reached. Upgrade to add more.' });
          setShowUpgrade(true);
          setLoading(false);
          return;
        }
        const newProfile = await createVoiceProfile(formData);
        setProfiles([...profiles, newProfile]);
        setSelectedProfile(newProfile);
        setIsCreating(false);
        setMessage({ type: 'success', text: 'Profil créé avec succès' });
      }
      await loadProfiles();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur lors de la sauvegarde' });
    } finally {
      setLoading(false);
    }
  };

  const handleNewProfile = () => {
    setIsCreating(true);
    setSelectedProfile(null);
    setFormData({
      name: '',
      tone_style: ['energetic'],
      emoji_usage: 'moderate',
      language_style: ['english'],
      include_slang: true,
      avoid_cringe_hashtags: false,
      use_trending_hashtags: true,
      include_artist_name: true,
      brand_guidelines: {},
      content_focus: '',
      preferred_genres: [],
    });
  };

  const toggleArrayItem = (array: string[], item: string, setter: (arr: string[]) => void) => {
    if (array.includes(item)) {
      setter(array.filter(i => i !== item));
    } else {
      setter([...array, item]);
    }
  };

  return (
    <div className="space-y-6">
      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        title="Voice profile limit reached"
        message="Upgrade your plan to create more voice profiles."
      />
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Profil de voix</h1>
        <p className="text-slate-600 mt-2">Configurez comment l'AI génère du contenu pour votre marque</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Profils</h2>
              <button
                onClick={() => atVoiceLimit ? setShowUpgrade(true) : handleNewProfile()}
                disabled={atVoiceLimit}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                title={atVoiceLimit ? 'Limit reached — Upgrade to add more' : 'Nouveau profil'}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    setSelectedProfile(profile);
                    setIsCreating(false);
                    loadProfileData(profile);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition ${
                    selectedProfile?.id === profile.id
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'bg-slate-50 border-2 border-transparent hover:border-slate-200'
                  }`}
                >
                  <p className="font-medium text-slate-900">{profile.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {profile.tone_style?.join(', ') || 'Aucun style'}
                  </p>
                </button>
              ))}
              {profiles.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">
                  Aucun profil. Créez-en un nouveau.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nom du profil
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Ex: Artiste Principal, Marque Corporate..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Content focus (optional)
              </label>
              <input
                type="text"
                value={formData.content_focus}
                onChange={(e) => setFormData({ ...formData, content_focus: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="e.g. music videos, songs, live performances, beats"
              />
              <p className="text-xs text-slate-500 mt-1">Helps AI generate content that matches what you usually post.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Preferred genres (optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {['HipHop', 'Pop', 'R&B', 'Rock', 'Electronic', 'Rap', 'Soul', 'Indie', 'Jazz', 'Country'].map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleArrayItem(formData.preferred_genres, genre, (arr) => setFormData({ ...formData, preferred_genres: arr }))}
                    className={`px-3 py-1.5 rounded-lg border-2 text-sm transition ${
                      formData.preferred_genres.includes(genre)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">AI will favor these genres when suggesting titles and hashtags.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Tone style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {toneOptions.map((tone) => (
                  <button
                    key={tone}
                    onClick={() => toggleArrayItem(formData.tone_style, tone, (arr) => setFormData({ ...formData, tone_style: arr }))}
                    className={`px-4 py-2 rounded-lg border-2 transition text-sm ${
                      formData.tone_style.includes(tone)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Utilisation d'emojis
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['heavy', 'moderate', 'minimal'] as const).map((usage) => (
                  <button
                    key={usage}
                    onClick={() => setFormData({ ...formData, emoji_usage: usage })}
                    className={`px-4 py-3 rounded-lg border-2 transition ${
                      formData.emoji_usage === usage
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {usage === 'heavy' && '😊 Beaucoup'}
                    {usage === 'moderate' && '😐 Modéré'}
                    {usage === 'minimal' && '😑 Minimal'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Style de langue
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {languageOptions.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => toggleArrayItem(formData.language_style, lang, (arr) => setFormData({ ...formData, language_style: arr }))}
                    className={`px-4 py-2 rounded-lg border-2 transition text-sm ${
                      formData.language_style.includes(lang)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Préférences de contenu
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.include_slang}
                    onChange={(e) => setFormData({ ...formData, include_slang: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Inclure l'argot et les termes tendance</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.avoid_cringe_hashtags}
                    onChange={(e) => setFormData({ ...formData, avoid_cringe_hashtags: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Éviter les hashtags "cringe"</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.use_trending_hashtags}
                    onChange={(e) => setFormData({ ...formData, use_trending_hashtags: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Utiliser les hashtags tendance</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.include_artist_name}
                    onChange={(e) => setFormData({ ...formData, include_artist_name: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Inclure le nom de l'artiste/marque</span>
                </label>
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-lg ${
                message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {message.text}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={loading || !formData.name.trim()}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {loading ? 'Sauvegarde...' : isCreating ? 'Créer le profil' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
