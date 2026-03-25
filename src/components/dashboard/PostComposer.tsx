import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Youtube, Instagram, Video, Calendar as CalendarIcon, Send, Save, Upload, X, Image as ImageIcon, Sparkles, Wand2, TrendingUp, Search, Zap, Clock, BarChart3, FileText } from 'lucide-react';
import { uploadMedia, getMediaDisplayUrl } from '../../services/mediaService';
import { generateAIContent } from '../../services/aiService';
import { getVoiceProfiles, type VoiceProfile } from '../../services/voiceProfileService';
import { getRecommendedPostingTime } from '../../services/analyticsService';
import { predictPerformance } from '../../services/predictionService';
import { PerformancePrediction } from './PerformancePrediction';
import { UpgradeModal } from '../UpgradeModal';

export function PostComposer() {
  const { user } = useAuth();
  const { canUseFeature, isAtLimit } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string>('');
  const [previewImageError, setPreviewImageError] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [scheduleType] = useState<'once' | 'recurring'>('once');
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringTime] = useState('18:00');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<any[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    titles?: string[];
    descriptions?: string[];
    hashtags?: string[];
    tags?: string[];
  } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState<'titles' | 'descriptions' | 'hashtags' | 'tags' | null>(null);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [selectedVoiceProfile, setSelectedVoiceProfile] = useState<string | null>(null);
  const [improvementType, setImprovementType] = useState<'viral' | 'seo' | 'genz' | 'professional' | null>(null);
  const [recommendedTime, setRecommendedTime] = useState<{ day: number; hour: number; label: string } | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [showPrediction, setShowPrediction] = useState(false);
  const [predictionThumbnail, setPredictionThumbnail] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [lastUploadedFileName, setLastUploadedFileName] = useState<string | null>(null);
  const [selectedMediaPreviewUrl, setSelectedMediaPreviewUrl] = useState<string | null>(null);
  const [captionTemplates, setCaptionTemplates] = useState<{ id: string; name: string; content: string }[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    loadMediaLibrary();
    loadVoiceProfiles();
    loadCaptionTemplates();
  }, [user]);

  useEffect(() => {
    if (selectedPlatforms.length > 0) {
      loadRecommendedTime(selectedPlatforms[0]);
    } else {
      setRecommendedTime(null);
    }
  }, [selectedPlatforms]);

  useEffect(() => {
    if (selectedMedia.length === 0 || !mediaLibrary.length) {
      setSelectedMediaPreviewUrl(null);
      setPreviewImageError(false);
      return;
    }
    const media = mediaLibrary.find(m => m.id === selectedMedia[0]);
    if (!media) {
      setSelectedMediaPreviewUrl(null);
      setPreviewImageError(false);
      return;
    }
    if (media.file_type === 'video') {
      setSelectedMediaPreviewUrl(predictionThumbnail);
      setPreviewImageError(false);
      return;
    }
    setPreviewImageError(false);
    getMediaDisplayUrl(media.file_url).then((url) => {
      setSelectedMediaPreviewUrl(url || null);
    }).catch(() => setSelectedMediaPreviewUrl(media.file_url || null));
  }, [selectedMedia, mediaLibrary, predictionThumbnail]);

  const loadRecommendedTime = async (platform: string) => {
    setLoadingRecommendation(true);
    try {
      const recommendation = await getRecommendedPostingTime(platform);
      setRecommendedTime(recommendation);
    } catch (error) {
      console.error('Error loading recommended time:', error);
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const applyRecommendedTime = () => {
    if (!recommendedTime) return;
    
    const today = new Date();
    const currentDay = today.getDay();
    let daysUntilTarget = recommendedTime.day - currentDay;
    if (daysUntilTarget <= 0) daysUntilTarget += 7;
    
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);
    
    setScheduledDate(targetDate.toISOString().split('T')[0]);
    setScheduledTime(`${recommendedTime.hour.toString().padStart(2, '0')}:00`);
  };

  function computeNextRecurrence(from: Date, daysOfWeek: number[], hours: number, minutes: number): string {
    const d = new Date(from);
    d.setDate(d.getDate() + 1);
    d.setHours(hours, minutes, 0, 0);
    for (let i = 0; i < 8; i++) {
      const c = new Date(d);
      c.setDate(c.getDate() + i);
      if (daysOfWeek.includes(c.getDay())) return c.toISOString();
    }
    return d.toISOString();
  }

  const loadVoiceProfiles = async () => {
    if (!user) return;
    try {
      const profiles = await getVoiceProfiles();
      setVoiceProfiles(profiles);
      if (profiles.length > 0 && !selectedVoiceProfile) {
        setSelectedVoiceProfile(profiles[0].id);
      }
    } catch (error) {
      console.error('Error loading voice profiles:', error);
    }
  };

  const loadCaptionTemplates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('caption_templates')
      .select('id, name, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setCaptionTemplates(data || []);
  };

  const saveAsTemplate = async () => {
    const name = templateName.trim() || 'Sans titre';
    const content = [title, description].filter(Boolean).join('\n\n');
    if (!content.trim()) {
      setMessage({ type: 'error', text: 'Ajoutez un titre ou une description pour enregistrer un modèle.' });
      return;
    }
    if (!user) return;
    setSavingTemplate(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('caption_templates').insert({
        user_id: user.id,
        name,
        content,
      });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Modèle enregistré.' });
      setTemplateName('');
      await loadCaptionTemplates();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = (t: { id: string; name: string; content: string }) => {
    const parts = t.content.split(/\n\n+/);
    if (parts.length >= 2) {
      setTitle(parts[0]);
      setDescription(parts.slice(1).join('\n\n'));
    } else {
      setDescription(t.content);
    }
  };

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
    if (isAtLimit('mediaItems') || isAtLimit('storage')) {
      setUpgradeMessage('You\'ve reached your media limit. Upgrade to add more.');
      setShowUpgrade(true);
      return;
    }
    setUploading(true);
    try {
      const file = files[0];
      const result = await uploadMedia(file, user.id);
      setSelectedMedia([result.id]);
      setLastUploadedFileName(file.name);
      await loadMediaLibrary();
      
      if (file.type.startsWith('video/')) {
        const thumbnail = await extractVideoThumbnail(file);
        if (thumbnail) setPredictionThumbnail(thumbnail);
        
        const videoEl = document.createElement('video');
        videoEl.preload = 'metadata';
        videoEl.onloadedmetadata = () => {
          const d = Math.round(videoEl.duration);
          if (Number.isFinite(d) && d > 0) {
            setVideoDuration(d);
            supabase.from('media_library').update({ duration: d }).eq('id', result.id).eq('user_id', user.id).then(() => {});
          }
          URL.revokeObjectURL(videoEl.src);
        };
        videoEl.src = URL.createObjectURL(file);
      }
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

  const extractVideoThumbnail = async (videoFile: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let resolved = false;
      
      const cleanup = () => {
        if (video.src) {
          URL.revokeObjectURL(video.src);
        }
      };
      
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      
      video.onloadedmetadata = () => {
        if (resolved) return;
        video.currentTime = Math.min(2, video.duration / 4);
      };
      
      video.onseeked = () => {
        if (resolved) return;
        try {
          canvas.width = Math.min(video.videoWidth, 800);
          canvas.height = Math.min(video.videoHeight, 600);
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
            resolved = true;
            cleanup();
            resolve(thumbnail);
          } else {
            resolved = true;
            cleanup();
            resolve(null);
          }
        } catch (error) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      };
      
      video.onerror = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      };
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, 10000);
      
      video.src = URL.createObjectURL(videoFile);
    });
  };

  const handleGenerateAI = async (contentType: 'title' | 'description' | 'hashtags' | 'tags' | 'all', improve?: boolean) => {
    if (selectedPlatforms.length === 0) {
      setMessage({ type: 'error', text: 'Sélectionnez d\'abord une plateforme' });
      return;
    }

    if (improve && !improvementType) {
      setImprovementType('viral');
      return;
    }

    setAiGenerating(true);
    setMessage(null);

    try {
      const platform = selectedPlatforms[0] as 'youtube' | 'instagram' | 'tiktok';
      const keywords = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

      let promptTitle = title;
      let promptDescription = description;

      if (improve && improvementType) {
        const improvementInstructions = {
          viral: 'OPTIMIZE THIS CONTENT TO BE VIRAL AND ENGAGING. Add powerful hooks, emotional triggers, trending elements, curiosity gaps, and attention-grabbing phrases. Make it IMPRESSIVE and share-worthy. For music content: emphasize the artist, song energy, and make viewers want to watch/listen immediately.',
          seo: 'OPTIMIZE THIS CONTENT FOR MAXIMUM SEO AND DISCOVERABILITY. Add relevant keywords naturally, improve searchability, include trending terms, and enhance visibility. Make it easy to find.',
          genz: 'MAKE THIS CONTENT GEN-Z FRIENDLY AND TRENDING. Use modern slang, current cultural references, trending phrases, and Gen-Z language patterns. Make it relatable and cool.',
          professional: 'MAKE THIS CONTENT MORE PROFESSIONAL AND POLISHED. Use refined language, business-appropriate tone, and sophisticated phrasing while maintaining engagement.'
        };
        
        if (contentType === 'title' && promptTitle) {
          promptTitle = `IMPROVE THIS TITLE TO BE MORE VIRAL AND IMPRESSIVE: "${promptTitle}". ${improvementInstructions[improvementType]}`;
        } else if (contentType === 'description' && promptDescription) {
          promptDescription = `IMPROVE THIS DESCRIPTION TO BE MORE ENGAGING: "${promptDescription}". ${improvementInstructions[improvementType]}`;
        } else {
          promptTitle = `${promptTitle || 'Content'}. ${improvementInstructions[improvementType]}`;
          promptDescription = `${promptDescription || 'Content'}. ${improvementInstructions[improvementType]}`;
        }
      }

      let videoThumbnail: string | null = null;
      let mediaId: string | undefined = undefined;
      let videoFileName: string | undefined = undefined;

      if (selectedMedia.length > 0) {
        const media = mediaLibrary.find(m => m.id === selectedMedia[0]);
        if (media) {
          mediaId = media.id;
          videoFileName = media.file_name;
          if (media.file_type === 'video') {
            try {
              let videoUrl = media.file_url;

              if (!videoUrl.startsWith('http')) {
                const urlParts = media.file_url.split('/');
                const mediaIndex = urlParts.indexOf('media');
                if (mediaIndex !== -1) {
                  const filePath = urlParts.slice(mediaIndex + 1).join('/');
                  const { data: signedUrl } = await supabase.storage
                    .from('media')
                    .createSignedUrl(filePath, 3600);
                  if (signedUrl) {
                    videoUrl = signedUrl.signedUrl;
                  }
                }
              }

              const response = await fetch(videoUrl);
              if (response.ok) {
                const blob = await response.blob();
                const videoFile = new File([blob], media.file_name, { type: blob.type || 'video/mp4' });
                videoThumbnail = await extractVideoThumbnail(videoFile);
              }
            } catch (error) {
              console.error('Error extracting thumbnail:', error);
            }
          } else if (media.file_type === 'image' && media.file_url) {
            try {
              let imageUrl = media.file_url;
              if (!imageUrl.startsWith('http')) {
                const urlParts = media.file_url.split('/');
                const mediaIndex = urlParts.indexOf('media');
                if (mediaIndex !== -1) {
                  const filePath = urlParts.slice(mediaIndex + 1).join('/');
                  const { data: signedUrl } = await supabase.storage
                    .from('media')
                    .createSignedUrl(filePath, 3600);
                  if (signedUrl) imageUrl = signedUrl.signedUrl;
                }
              }
              const response = await fetch(imageUrl);
              if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                videoThumbnail = await new Promise<string | null>((resolve) => {
                  reader.onloadend = () => resolve(reader.result as string || null);
                  reader.readAsDataURL(blob);
                });
              }
            } catch (error) {
              console.error('Error loading image for AI:', error);
            }
          }
        }
      }
      if (!videoThumbnail && predictionThumbnail) {
        videoThumbnail = predictionThumbnail;
      }
      if (!videoFileName && lastUploadedFileName) {
        videoFileName = lastUploadedFileName;
      }

      const result = await generateAIContent({
        platform,
        contentType,
        videoTitle: promptTitle || undefined,
        videoDescription: promptDescription || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        voiceProfileId: selectedVoiceProfile || undefined,
        videoThumbnail: videoThumbnail || undefined,
        mediaId: mediaId,
        videoFileName: videoFileName,
      });

      setAiSuggestions(result);
      if (contentType === 'all') {
        setShowSuggestions('titles');
      } else if (contentType === 'title') {
        setShowSuggestions('titles');
      } else if (contentType === 'description') {
        setShowSuggestions('descriptions');
      } else if (contentType === 'hashtags') {
        setShowSuggestions('hashtags');
      } else if (contentType === 'tags') {
        setShowSuggestions('tags');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Erreur lors de la génération AI';
      setMessage({ type: 'error', text: errMsg });
      if (errMsg.includes('limit') || errMsg.includes('Upgrade')) {
        setUpgradeMessage(errMsg);
        setShowUpgrade(true);
      }
    } finally {
      setAiGenerating(false);
    }
  };

  const selectSuggestion = (type: 'title' | 'description' | 'hashtags' | 'tags', value: string) => {
    if (type === 'title') {
      setTitle(value);
    } else if (type === 'description') {
      setDescription(value);
    } else if (type === 'hashtags') {
      setTags(value);
    } else if (type === 'tags') {
      setTags(value);
    }
    setShowSuggestions(null);
  };

  const handleSave = async (publish: boolean = false) => {
    if (!user || !title || selectedPlatforms.length === 0) {
      setMessage({ type: 'error', text: 'Veuillez remplir tous les champs requis' });
      return;
    }

    if (scheduleType === 'recurring' && !canUseFeature('recurringSchedules')) {
      setUpgradeMessage('Recurring schedules are available on Starter and Pro plans.');
      setShowUpgrade(true);
      return;
    }

    if (publish && isAtLimit('posts')) {
      setUpgradeMessage('You have reached your monthly post limit. Upgrade to create more posts.');
      setShowUpgrade(true);
      return;
    }

    if (selectedPlatforms.includes('youtube') && selectedMedia.length === 0) {
      setMessage({ type: 'error', text: 'Veuillez sélectionner une vidéo pour YouTube' });
      return;
    }
    if (selectedPlatforms.includes('instagram') && selectedMedia.length === 0) {
      setMessage({ type: 'error', text: 'Veuillez sélectionner un média (image ou vidéo) pour Instagram' });
      return;
    }

    if (scheduleType === 'recurring') {
      if (recurringDays.length === 0) {
        setMessage({ type: 'error', text: 'Sélectionnez au moins un jour pour la récurrence' });
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
        const [hours, minutes] = recurringTime.split(':').map(Number);
        const nextRun = computeNextRecurrence(new Date(), recurringDays, hours, minutes);
        const { error } = await supabase
          .from('recurring_schedules')
          .insert({
            user_id: user.id,
            title,
            description: description || null,
            tags: tagsArray,
            media_ids: selectedMedia,
            platforms: selectedPlatforms,
            days_of_week: recurringDays,
            time_local: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
            timezone: 'UTC',
            next_run_at: nextRun,
            is_active: true,
          });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Récurrence enregistrée. La publication sera créée automatiquement aux dates planifiées.' });
        setTitle('');
        setDescription('');
        setTags('');
        setSelectedPlatforms([]);
        setSelectedMedia([]);
        setRecurringDays([]);
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur lors de l\'enregistrement' });
      } finally {
        setLoading(false);
      }
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
          let predictionData: any = {};
          
          try {
            const tagsForPrediction = tags.split(',').map(t => t.trim()).filter(t => t);
            const scheduledDay = scheduledDate ? new Date(scheduledDate).getDay() : undefined;
            const scheduledHour = scheduledTime ? parseInt(scheduledTime.split(':')[0]) : undefined;
            
            const prediction = await predictPerformance(
              platform,
              title,
              description,
              tagsForPrediction,
              scheduledDay,
              scheduledHour
            );
            
            predictionData = {
              predicted_views_min: prediction.viewsMin,
              predicted_views_max: prediction.viewsMax,
              predicted_engagement: prediction.engagementRate,
              prediction_score: prediction.overallScore,
              predicted_at: new Date().toISOString()
            };
          } catch (predictionError) {
            console.error('Prediction failed:', predictionError);
          }
          
          await supabase.from('platform_posts').insert({
            post_id: data.id,
            platform,
            status: 'pending',
            ...predictionData
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
              .select('file_url, file_name')
              .eq('id', selectedMedia[0])
              .single();

            if (media) {
              let filePath: string | null = null;
              try {
                const urlObj = new URL(media.file_url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                const mediaIndex = pathParts.indexOf('media');
                if (mediaIndex !== -1 && mediaIndex < pathParts.length - 1) {
                  filePath = pathParts.slice(mediaIndex + 1).join('/');
                }
              } catch {
                const urlParts = media.file_url.split('/');
                const mediaIndex = urlParts.indexOf('media');
                if (mediaIndex !== -1 && mediaIndex < urlParts.length - 1) {
                  filePath = urlParts.slice(mediaIndex + 1).join('/');
                }
              }
              if (!filePath) throw new Error('Could not extract file path from video URL');
              const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-publish`, {
                method: 'POST',
                headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  postId: data.id,
                  accountId: account.id,
                  title,
                  description,
                  tags: tagsArray,
                  filePath,
                  scheduledFor,
                }),
              });
              if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error || 'Failed to publish to YouTube';
                if (errorMessage.includes('youtubeSignupRequired') || errorMessage.includes('YouTube channel not found')) {
                  throw new Error('Please create a YouTube channel first. Go to youtube.com and create a channel for your Google account, then try again.');
                }
                throw new Error(errorMessage);
              }
            }
          }
        }

        if (publish && selectedPlatforms.includes('instagram')) {
          const { data: igAccount } = await supabase
            .from('connected_accounts')
            .select('id')
            .eq('user_id', user.id)
            .eq('platform', 'instagram')
            .eq('is_active', true)
            .single();

          if (igAccount) {
            const { data: media } = await supabase
              .from('media_library')
              .select('file_url, file_type')
              .eq('id', selectedMedia[0])
              .single();

            if (media) {
              let filePath: string | null = null;
              try {
                const urlObj = new URL(media.file_url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                const mediaIndex = pathParts.indexOf('media');
                if (mediaIndex !== -1 && mediaIndex < pathParts.length - 1) {
                  filePath = pathParts.slice(mediaIndex + 1).join('/');
                }
              } catch {
                const urlParts = media.file_url.split('/');
                const mediaIndex = urlParts.indexOf('media');
                if (mediaIndex !== -1 && mediaIndex < urlParts.length - 1) {
                  filePath = urlParts.slice(mediaIndex + 1).join('/');
                }
              }
              if (!filePath) throw new Error('Could not extract file path for Instagram');
              const caption = [title, description].filter(Boolean).join('\n\n');
              const mediaType = media.file_type === 'video' ? 'video' : 'image';
              const baseUrl = import.meta.env.VITE_SUPABASE_URL;
              const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
              const response = await fetch(
                `${baseUrl}/functions/v1/instagram-publish?apikey=${encodeURIComponent(anonKey)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain' },
                  body: JSON.stringify({
                    postId: data.id,
                    accountId: igAccount.id,
                    caption,
                    filePath,
                    mediaType,
                  }),
                }
              );
              if (!response.ok && response.status !== 202) {
                let errorData: { error?: string } = {};
                try {
                  const text = await response.text();
                  if (text) errorData = JSON.parse(text);
                } catch {
                  // 503 etc. may return non-JSON
                }
                const msg =
                  errorData.error ||
                  (response.status === 503
                    ? 'Service temporairement indisponible (délai dépassé). Pour les vidéos, vérifiez plus tard sur Instagram.'
                    : 'Failed to publish to Instagram');
                throw new Error(msg);
              }
              // 202 = video queued for async publish; trigger completion check after a delay
              if (response.status === 202) {
                setMessage({
                  type: 'success',
                  text: 'Publication créée ! Votre vidéo sera en ligne sur Instagram dans quelques minutes.'
                });
                setTitle('');
                setDescription('');
                setTags('');
                setSelectedPlatforms([]);
                setSelectedMedia([]);
                setScheduledDate('');
                setScheduledTime('');
                setLoading(false);
                const completeUrl = import.meta.env.VITE_SUPABASE_URL;
                const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
                setTimeout(() => {
                  fetch(
                    `${completeUrl}/functions/v1/instagram-publish-complete?apikey=${encodeURIComponent(anonKey)}`,
                    { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '' }
                  ).catch(() => {});
                }, 35000);
                return;
              }
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
      <UpgradeModal
        open={showUpgrade}
        onClose={() => { setShowUpgrade(false); setUpgradeMessage(''); }}
        title="Upgrade your plan"
        message={upgradeMessage || undefined}
      />
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
                  {(isAtLimit('mediaItems') || isAtLimit('storage')) ? (
                    <div className="space-y-3">
                      <p className="text-slate-600">You&apos;ve reached your media limit.</p>
                      <button
                        type="button"
                        onClick={() => { setUpgradeMessage('Upgrade to add more media and storage.'); setShowUpgrade(true); }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
                      >
                        Upgrade plan
                      </button>
                    </div>
                  ) : (
                    <>
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
                        disabled={uploading}
                        className="mt-4 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      >
                        ou sélectionner depuis la bibliothèque
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                  {mediaLibrary.find(m => m.id === selectedMedia[0]) && (
                    <>
                      <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0 flex items-center justify-center">
                        {selectedMediaPreviewUrl && !previewImageError ? (
                          <img
                            src={selectedMediaPreviewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={() => setPreviewImageError(true)}
                          />
                        ) : (
                          mediaLibrary.find(m => m.id === selectedMedia[0])?.file_type === 'video' ? (
                            <Video className="w-8 h-8 text-slate-400" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-slate-400" />
                          )
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">
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
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="title" className="block text-sm font-medium text-slate-700">
                  Titre de la publication
                </label>
                <div className="flex gap-2">
                  {title && (
                    <button
                      onClick={() => handleGenerateAI('title', true)}
                      disabled={aiGenerating}
                      className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition flex items-center gap-1"
                      title="Améliorer ce titre"
                    >
                      <Wand2 className="w-3 h-3" />
                      Améliorer
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateAI('title')}
                    disabled={aiGenerating || selectedPlatforms.length === 0}
                    className="text-xs px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    {aiGenerating ? 'Génération...' : 'Générer avec AI'}
                  </button>
                </div>
              </div>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Mon titre accrocheur..."
              />
              {showSuggestions === 'titles' && aiSuggestions?.titles && (
                <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs font-medium text-purple-700 mb-2">Suggestions de titres:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {aiSuggestions.titles.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectSuggestion('title', suggestion)}
                        className="w-full text-left px-3 py-2 text-sm bg-white hover:bg-purple-100 rounded border border-purple-200 transition"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="description" className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {captionTemplates.length > 0 && (
                    <select
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700"
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) {
                          const t = captionTemplates.find((c) => c.id === id);
                          if (t) applyTemplate(t);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">Utiliser un modèle</option>
                      {captionTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Nom du modèle"
                      className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 w-36"
                    />
                    <button
                      type="button"
                      onClick={saveAsTemplate}
                      disabled={savingTemplate}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                      title="Enregistrer titre + description comme modèle"
                    >
                      <FileText className="w-4 h-4" />
                      Sauver modèle
                    </button>
                  </div>
                  {description && (
                    <button
                      onClick={() => handleGenerateAI('description', true)}
                      disabled={aiGenerating}
                      className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition flex items-center gap-1"
                      title="Améliorer cette description"
                    >
                      <Wand2 className="w-3 h-3" />
                      Améliorer
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateAI('description')}
                    disabled={aiGenerating || selectedPlatforms.length === 0}
                    className="text-xs px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    {aiGenerating ? 'Génération...' : 'Générer avec AI'}
                  </button>
                </div>
              </div>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                placeholder="Décrivez votre contenu..."
              />
              <p className="text-sm text-slate-500 mt-2">{description.length} caractères</p>
              {showSuggestions === 'descriptions' && aiSuggestions?.descriptions && (
                <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs font-medium text-purple-700 mb-2">Suggestions de descriptions:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {aiSuggestions.descriptions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectSuggestion('description', suggestion)}
                        className="w-full text-left px-3 py-2 text-sm bg-white hover:bg-purple-100 rounded border border-purple-200 transition line-clamp-2"
                      >
                        {suggestion.substring(0, 100)}...
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedPlatforms.includes('youtube') && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="tags" className="block text-sm font-medium text-slate-700">
                    Tags YouTube (séparés par des virgules)
                  </label>
                  <div className="flex gap-2">
                    {tags && (
                      <button
                        onClick={() => handleGenerateAI('tags', true)}
                        disabled={aiGenerating}
                        className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition flex items-center gap-1"
                        title="Améliorer ces tags"
                      >
                        <Wand2 className="w-3 h-3" />
                        Améliorer
                      </button>
                    )}
                    <button
                      onClick={() => handleGenerateAI('tags')}
                      disabled={aiGenerating || selectedPlatforms.length === 0}
                      className="text-xs px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded transition flex items-center gap-1 disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3" />
                      {aiGenerating ? 'Génération...' : 'Générer avec AI'}
                    </button>
                  </div>
                </div>
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
                {showSuggestions === 'tags' && aiSuggestions?.tags && (
                  <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs font-medium text-purple-700 mb-2">Suggestions de tags:</p>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.tags.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const currentTags = tags.split(',').map(t => t.trim()).filter(t => t);
                            const newTags = [...currentTags, suggestion].join(', ');
                            setTags(newTags);
                          }}
                          className="px-3 py-1 text-xs bg-white hover:bg-purple-100 rounded border border-purple-200 transition"
                        >
                          + {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {(selectedPlatforms.includes('instagram') || selectedPlatforms.includes('tiktok')) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="hashtags" className="block text-sm font-medium text-slate-700">
                    Hashtags (séparés par des virgules)
                  </label>
                  <div className="flex gap-2">
                    {tags && (
                      <button
                        onClick={() => handleGenerateAI('hashtags', true)}
                        disabled={aiGenerating}
                        className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition flex items-center gap-1"
                        title="Améliorer ces hashtags"
                      >
                        <Wand2 className="w-3 h-3" />
                        Améliorer
                      </button>
                    )}
                    <button
                      onClick={() => handleGenerateAI('hashtags')}
                      disabled={aiGenerating || selectedPlatforms.length === 0}
                      className="text-xs px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded transition flex items-center gap-1 disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3" />
                      {aiGenerating ? 'Génération...' : 'Générer avec AI'}
                    </button>
                  </div>
                </div>
                <input
                  id="hashtags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="#music #video #trending"
                />
                <p className="text-sm text-slate-500 mt-2">
                  {tags.split(',').filter(t => t.trim()).length} hashtags
                </p>
                {showSuggestions === 'hashtags' && aiSuggestions?.hashtags && (
                  <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs font-medium text-purple-700 mb-2">Suggestions de hashtags:</p>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.hashtags.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const currentHashtags = tags.split(',').map(t => t.trim()).filter(t => t);
                            const newHashtags = [...currentHashtags, suggestion].join(', ');
                            setTags(newHashtags);
                          }}
                          className="px-3 py-1 text-xs bg-white hover:bg-purple-100 rounded border border-purple-200 transition"
                        >
                          + {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {voiceProfiles.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Profil de voix (AI)
                </label>
                <select
                  value={selectedVoiceProfile || ''}
                  onChange={(e) => setSelectedVoiceProfile(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                >
                  {voiceProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Le contenu généré respectera ce style</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Génération complète avec AI</p>
                  <p className="text-xs text-slate-600">Génère titre, description et tags en une fois</p>
                </div>
                <button
                  onClick={() => handleGenerateAI('all')}
                  disabled={aiGenerating || selectedPlatforms.length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50 font-medium"
                >
                  <Sparkles className="w-4 h-4" />
                  {aiGenerating ? 'Génération...' : 'Tout générer'}
                </button>
              </div>

              <div className="flex items-center gap-2 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-200">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Performance Prediction</p>
                  <p className="text-xs text-slate-600">Predict views & engagement before posting</p>
                </div>
                <button
                  onClick={() => setShowPrediction(!showPrediction)}
                  disabled={selectedPlatforms.length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50 font-medium"
                >
                  <BarChart3 className="w-4 h-4" />
                  {showPrediction ? 'Hide' : 'Predict'}
                </button>
              </div>
            </div>

            {showPrediction && selectedPlatforms.length > 0 && (
              <PerformancePrediction
                platform={selectedPlatforms[0]}
                title={title}
                description={description}
                hashtags={tags.split(',').map(t => t.trim()).filter(t => t)}
                scheduledDay={scheduledDate ? new Date(scheduledDate).getDay() : undefined}
                scheduledHour={scheduledTime ? parseInt(scheduledTime.split(':')[0]) : undefined}
                thumbnailBase64={predictionThumbnail || undefined}
                videoDuration={(videoDuration && videoDuration > 0 && Number.isFinite(videoDuration)) ? videoDuration : undefined}
                onClose={() => setShowPrediction(false)}
              />
            )}

            {improvementType && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-medium text-blue-900 mb-2">Type d'amélioration:</p>
                <div className="flex flex-wrap gap-2">
                  {(['viral', 'seo', 'genz', 'professional'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setImprovementType(type)}
                      className={`px-3 py-1 text-xs rounded transition ${
                        improvementType === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'
                      }`}
                    >
                      {type === 'viral' && <><TrendingUp className="w-3 h-3 inline mr-1" />Viral</>}
                      {type === 'seo' && <><Search className="w-3 h-3 inline mr-1" />SEO</>}
                      {type === 'genz' && <><Zap className="w-3 h-3 inline mr-1" />Gen-Z</>}
                      {type === 'professional' && 'Professionnel'}
                    </button>
                  ))}
                </div>
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

            {recommendedTime && selectedPlatforms.length > 0 && (
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Clock className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900">Optimal Posting Time</p>
                    <p className="text-sm text-green-700 mt-1">
                      {loadingRecommendation ? 'Calculating...' : recommendedTime.label}
                    </p>
                    <p className="text-xs text-green-600 mt-1">Based on your past performance</p>
                  </div>
                  <button
                    onClick={applyRecommendedTime}
                    disabled={loadingRecommendation}
                    className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

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
                {scheduleType === 'recurring' ? (
                  <>
                    <CalendarIcon className="w-5 h-5" />
                    Enregistrer la récurrence
                  </>
                ) : scheduledDate && scheduledTime ? (
                  <>
                    <CalendarIcon className="w-5 h-5" />
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

          {scheduleType === 'recurring' ? (
            recurringDays.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <div className="flex items-start gap-3">
                  <CalendarIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900">Publication récurrente</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Chaque {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].filter((_, i) => recurringDays.includes(i)).join(', ')} à {recurringTime}
                    </p>
                  </div>
                </div>
              </div>
            )
          ) : scheduledDate && scheduledTime && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <CalendarIcon className="w-5 h-5 text-blue-600 mt-0.5" />
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
                    onClick={async () => {
                      setSelectedMedia([media.id]);
                      setShowMediaPicker(false);
                      
                      if (media.file_type === 'video' && media.file_url) {
                        try {
                          const filePath = media.file_url.includes('/media/') 
                            ? media.file_url.split('/media/')[1] 
                            : media.file_url;
                          const { data: signedData } = await supabase.storage
                            .from('media')
                            .createSignedUrl(filePath, 300);
                          
                          if (signedData?.signedUrl) {
                            const videoEl = document.createElement('video');
                            videoEl.preload = 'metadata';
                            videoEl.muted = true;
                            videoEl.crossOrigin = 'anonymous';
                            
                            videoEl.onloadedmetadata = () => {
                              const d = Math.round(videoEl.duration);
                              if (Number.isFinite(d) && d > 0) setVideoDuration(d);
                              videoEl.currentTime = Math.min(2, videoEl.duration / 4);
                            };
                            
                            videoEl.onseeked = () => {
                              const canvas = document.createElement('canvas');
                              canvas.width = Math.min(videoEl.videoWidth, 640);
                              canvas.height = Math.min(videoEl.videoHeight, 360);
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                                const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                                setPredictionThumbnail(thumbnail);
                              }
                              URL.revokeObjectURL(videoEl.src);
                            };
                            
                            videoEl.src = signedData.signedUrl;
                          }
                        } catch (err) {
                          console.error('Failed to extract video metadata:', err);
                        }
                      }
                    }}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                      selectedMedia.includes(media.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-full aspect-video bg-slate-100 rounded flex items-center justify-center mb-2 overflow-hidden">
                      {media.file_type === 'video' ? (
                        <Video className="w-8 h-8 text-slate-400" />
                      ) : media.file_url ? (
                        <img src={media.file_url} alt="" className="w-full h-full object-cover" />
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
