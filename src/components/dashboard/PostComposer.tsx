import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Youtube, Instagram, Video, Calendar, Send, Save, Upload, X, Image as ImageIcon } from 'lucide-react';
import { uploadMedia } from '../../services/mediaService';

export function PostComposer() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<any[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMediaLibrary();
  }, [user]);

  const platforms = [
    { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-50' },
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-50' },
    { id: 'tiktok', name: 'TikTok', icon: Video, color: 'text-cyan-500', bgColor: 'bg-cyan-50' },
  ];

  const loadMediaLibrary = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('media_library')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setMediaLibrary(data || []);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      const file = files[0];
      const result = await uploadMedia(file, user.id);
      setSelectedMedia([result.id]);
      await loadMediaLibrary();
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'upload' });
    } finally {
      setUploading(false);
    }
  };

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformId)
        ? prev.filter(p => p !== platformId)
        : [...prev, platformId]
    );
  };

  const handleSave = async (publish: boolean = false) => {
    if (!user || !title || selectedPlatforms.length === 0) {
      setMessage({ type: 'error', text: 'Veuillez remplir tous les champs requis' });
      return;
    }

    if (selectedPlatforms.includes('youtube') && selectedMedia.length === 0) {
      setMessage({ type: 'error', text: 'Veuillez sélectionner une vidéo pour YouTube' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      let scheduledFor = null;
      if (scheduledDate && scheduledTime) {
        scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const status = publish ? 'published' : (scheduledFor ? 'scheduled' : 'draft');
      const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          title,
          description,
          tags: tagsArray,
          media_ids: selectedMedia,
          platforms: selectedPlatforms,
          status,
          scheduled_for: scheduledFor,
          published_at: publish ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        for (const platform of selectedPlatforms) {
          await supabase.from('platform_posts').insert({
            post_id: data.id,
            platform,
            status: publish ? 'published' : 'pending',
          });
        }

        if (publish && selectedPlatforms.includes('youtube')) {
          const { data: account } = await supabase
            .from('connected_accounts')
            .select('id')
            .eq('user_id', user.id)
            .eq('platform', 'youtube')
            .eq('is_active', true)
            .single();

          if (account) {
            const { data: media } = await supabase
              .from('media_library')
              .select('file_url')
              .eq('id', selectedMedia[0])
              .single();

            if (media) {
              const { data: { session } } = await supabase.auth.getSession();
              await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-publish`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session?.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  postId: data.id,
                  accountId: account.id,
                  title,
                  description,
                  tags: tagsArray,
                  videoUrl: media.file_url,
                  scheduledFor: scheduledFor,
                }),
              });
            }
          }
        }
      }

      setMessage({
        type: 'success',
        text: publish ? 'Publication créée avec succès !' : scheduledFor ? 'Post planifié !' : 'Brouillon sauvegardé !'
      });

      setTitle('');
      setDescription('');
      setTags('');
      setSelectedPlatforms([]);
      setSelectedMedia([]);
      setScheduledDate('');
      setScheduledTime('');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Une erreur est survenue' });
      console.error('Error saving post:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Créer une publication</h1>
        <p className="text-slate-600 mt-2">Partagez votre contenu sur plusieurs plateformes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Vidéo / Média
              </label>
              {selectedMedia.length === 0 ? (
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,image/*"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex flex-col items-center gap-2 mx-auto"
                  >
                    <Upload className="w-8 h-8 text-slate-400" />
                    <span className="text-sm text-slate-600">
                      {uploading ? 'Upload en cours...' : 'Cliquez pour uploader'}
                    </span>
                  </button>
                  <button
                    onClick={() => setShowMediaPicker(true)}
                    className="mt-4 text-sm text-blue-600 hover:text-blue-700"
                  >
                    ou sélectionner depuis la bibliothèque
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                  {mediaLibrary.find(m => m.id === selectedMedia[0]) && (
                    <>
                      <div className="w-16 h-16 bg-slate-200 rounded flex items-center justify-center">
                        {mediaLibrary.find(m => m.id === selectedMedia[0])?.file_type === 'video' ? (
                          <Video className="w-6 h-6 text-slate-400" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">
                          {mediaLibrary.find(m => m.id === selectedMedia[0])?.file_name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {(mediaLibrary.find(m => m.id === selectedMedia[0])?.file_size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedMedia([])}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-2">
                Titre de la publication
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Mon titre accrocheur..."
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                placeholder="Décrivez votre contenu..."
              />
              <p className="text-sm text-slate-500 mt-2">{description.length} caractères</p>
            </div>

            {selectedPlatforms.includes('youtube') && (
              <div>
                <label htmlFor="tags" className="block text-sm font-medium text-slate-700 mb-2">
                  Tags YouTube (séparés par des virgules)
                </label>
                <input
                  id="tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="music, video, 2024, trending"
                />
                <p className="text-sm text-slate-500 mt-2">
                  {tags.split(',').filter(t => t.trim()).length} tags
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Plateformes de publication
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {platforms.map((platform) => {
                  const Icon = platform.icon;
                  const isSelected = selectedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      className={`p-4 rounded-lg border-2 transition ${
                        isSelected
                          ? `border-blue-500 ${platform.bgColor}`
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Icon className={`w-6 h-6 mx-auto mb-2 ${platform.color}`} />
                      <p className="text-sm font-medium text-slate-900">{platform.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-slate-700 mb-2">
                  Date de publication (optionnel)
                </label>
                <input
                  id="date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label htmlFor="time" className="block text-sm font-medium text-slate-700 mb-2">
                  Heure (optionnel)
                </label>
                <input
                  id="time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-lg ${
                message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {message.text}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => handleSave(false)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                Sauvegarder
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 transition disabled:opacity-50"
              >
                {scheduledDate && scheduledTime ? (
                  <>
                    <Calendar className="w-5 h-5" />
                    Planifier
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Publier maintenant
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Aperçu</h3>
            <div className="space-y-4">
              {selectedPlatforms.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  Sélectionnez des plateformes pour voir l'aperçu
                </p>
              ) : (
                selectedPlatforms.map((platformId) => {
                  const platform = platforms.find(p => p.id === platformId);
                  if (!platform) return null;
                  const Icon = platform.icon;
                  return (
                    <div key={platformId} className={`p-4 rounded-lg ${platform.bgColor}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className={`w-4 h-4 ${platform.color}`} />
                        <span className="text-sm font-medium text-slate-900">{platform.name}</span>
                      </div>
                      <div className="space-y-2">
                        {title && (
                          <p className="text-sm font-semibold text-slate-900 line-clamp-2">{title}</p>
                        )}
                        {description && (
                          <p className="text-xs text-slate-600 line-clamp-3">{description}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {scheduledDate && scheduledTime && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">Publication planifiée</p>
                  <p className="text-sm text-blue-700 mt-1">
                    {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Sélectionner un média</h3>
              <button
                onClick={() => setShowMediaPicker(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {mediaLibrary.map((media) => (
                  <div
                    key={media.id}
                    onClick={() => {
                      setSelectedMedia([media.id]);
                      setShowMediaPicker(false);
                    }}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                      selectedMedia.includes(media.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-full aspect-video bg-slate-100 rounded flex items-center justify-center mb-2">
                      {media.file_type === 'video' ? (
                        <Video className="w-8 h-8 text-slate-400" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-900 truncate">{media.file_name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(media.file_size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ))}
              </div>
              {mediaLibrary.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  Aucun média dans votre bibliothèque
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
