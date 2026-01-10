import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Upload, Image as ImageIcon, Video, Trash2, Search, X } from 'lucide-react';
import { uploadMedia, deleteMedia } from '../../services/mediaService';

interface Media {
  id: string;
  file_name: string;
  file_type: 'image' | 'video';
  file_url: string;
  file_size: number;
  thumbnail_url: string | null;
  created_at: string;
}

export function MediaLibrary() {
  const { user } = useAuth();
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMedia();
  }, [user]);

  const loadMedia = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('media_library')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMedia(data || []);
    } catch (error) {
      console.error('Error loading media:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !user) return;

    setUploading(true);
    const uploadedMedia: Media[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Upload ${i + 1}/${files.length}: ${file.name}`);

        const result = await uploadMedia(file, user.id);
        uploadedMedia.push(result);
      }

      setMedia([...uploadedMedia, ...media]);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Error uploading media:', error);
      alert('Erreur lors de l\'upload. Veuillez réessayer.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, fileUrl: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce média ?')) return;

    try {
      await deleteMedia(id, user!.id);
      setMedia(media.filter(m => m.id !== id));
    } catch (error) {
      console.error('Error deleting media:', error);
      alert('Erreur lors de la suppression. Veuillez réessayer.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredMedia = media.filter(m => {
    const matchesSearch = m.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || m.file_type === filterType;
    return matchesSearch && matchesType;
  });

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
          <h1 className="text-3xl font-bold text-slate-900">Bibliothèque de médias</h1>
          <p className="text-slate-600 mt-2">Gérez vos images et vidéos</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-lg">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Upload de médias</h3>
              <p className="text-sm text-slate-600 mt-1">
                {uploading ? uploadProgress : 'Images et vidéos acceptées'}
              </p>
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
              disabled={uploading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Upload en cours...' : 'Sélectionner des fichiers'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un média..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-3 rounded-lg font-medium transition ${
              filterType === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilterType('image')}
            className={`px-4 py-3 rounded-lg font-medium transition ${
              filterType === 'image'
                ? 'bg-blue-500 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Images
          </button>
          <button
            onClick={() => setFilterType('video')}
            className={`px-4 py-3 rounded-lg font-medium transition ${
              filterType === 'video'
                ? 'bg-blue-500 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Vidéos
          </button>
        </div>
      </div>

      {filteredMedia.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Aucun média</h3>
          <p className="text-slate-600">
            {searchQuery ? 'Aucun résultat trouvé pour votre recherche' : 'Commencez par uploader vos premiers médias'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMedia.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition group"
            >
              <div className="aspect-video bg-slate-100 flex items-center justify-center relative">
                {item.file_type === 'image' ? (
                  <ImageIcon className="w-12 h-12 text-slate-300" />
                ) : (
                  <Video className="w-12 h-12 text-slate-300" />
                )}
                <button
                  onClick={() => handleDelete(item.id, item.file_url)}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <p className="font-medium text-slate-900 truncate" title={item.file_name}>
                  {item.file_name}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-500">{formatFileSize(item.file_size)}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    item.file_type === 'image'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.file_type === 'image' ? 'Image' : 'Vidéo'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
