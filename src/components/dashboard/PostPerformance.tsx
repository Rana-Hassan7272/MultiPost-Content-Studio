import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  Eye, 
  Heart, 
  MessageCircle, 
  TrendingUp,
  Calendar,
  Filter,
  Youtube,
  Instagram,
  Video,
  ExternalLink,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { getPostPerformance, type PostPerformance as PostPerformanceType } from '../../services/analyticsService';
import { useDashboardNav } from '../../contexts/DashboardNavContext';

const platformIcons: Record<string, any> = {
  youtube: { icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-50' },
  instagram: { icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-50' },
  tiktok: { icon: Video, color: 'text-cyan-500', bgColor: 'bg-cyan-50' },
};

export function PostPerformance() {
  const { user } = useAuth();
  const navigate = useDashboardNav();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostPerformanceType[]>([]);
  const [sortBy, setSortBy] = useState<'views' | 'engagement' | 'date'>('date');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPerformance();
  }, [user]);

  const loadPerformance = async () => {
    if (!user) return;
    
    try {
      const data = await getPostPerformance();
      setPosts(data);
    } catch (error) {
      console.error('Error loading post performance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshMetrics = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not signed in');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-platform-metrics`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body as { error?: string })?.error ?? `Sync failed (${res.status})`;
        setSyncMessage(msg);
        setTimeout(() => setSyncMessage(null), 6000);
        return;
      }
      await loadPerformance();
      const found = (body as { found?: number })?.found ?? 0;
      const updated = (body as { updated?: number })?.updated ?? 0;
      const hint = (body as { hint?: string })?.hint;
      if (updated > 0) setSyncMessage(hint ? `Synced ${updated} post(s). ${hint}` : `Synced ${updated} post(s).`);
      else if (found > 0) setSyncMessage(hint || 'No new data from YouTube/Instagram. Try again later.');
      else setSyncMessage('No published posts to sync.');
      setTimeout(() => setSyncMessage(null), 8000);
    } catch (error) {
      console.error('Error syncing metrics:', error);
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed.');
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEngagementBadge = (rate: number) => {
    if (rate >= 5) return { bg: 'bg-green-100', text: 'text-green-700', label: 'Excellent' };
    if (rate >= 2) return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Good' };
    if (rate >= 1) return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Average' };
    return { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Low' };
  };

  const sortedPosts = [...posts]
    .filter(p => filterPlatform === 'all' || p.platform === filterPlatform)
    .sort((a, b) => {
      switch (sortBy) {
        case 'views':
          return b.views - a.views;
        case 'engagement':
          return b.engagement_rate - a.engagement_rate;
        case 'date':
        default:
          return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
      }
    });

  const totalViews = posts.reduce((sum, p) => sum + p.views, 0);
  const totalLikes = posts.reduce((sum, p) => sum + p.likes, 0);
  const totalComments = posts.reduce((sum, p) => sum + p.comments, 0);
  const avgEngagement = posts.length > 0 
    ? Math.round(posts.reduce((sum, p) => sum + p.engagement_rate, 0) / posts.length * 100) / 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Post Performance</h1>
        <p className="text-slate-600 mt-2">Track and analyze your content performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Total Views</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{formatNumber(totalViews)}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-600">
              <Eye className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Total Likes</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{formatNumber(totalLikes)}</p>
            </div>
            <div className="p-3 rounded-lg bg-pink-500/10 text-pink-600">
              <Heart className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Total Comments</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{formatNumber(totalComments)}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-green-600">
              <MessageCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Avg Engagement</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{avgEngagement}%</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-600">
              <BarChart3 className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-xl font-bold text-slate-900">All Posts</h2>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshMetrics}
                  disabled={syncing || posts.length === 0}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Refresh metrics'}
                </button>
                {syncMessage && (
                  <span className="text-sm text-slate-600">{syncMessage}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <select
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Platforms</option>
                  <option value="youtube">YouTube</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="date">Sort by Date</option>
                <option value="views">Sort by Views</option>
                <option value="engagement">Sort by Engagement</option>
              </select>
            </div>
          </div>
        </div>

        {sortedPosts.length === 0 ? (
          <div className="p-12 text-center">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No Posts Yet</h3>
            <p className="text-slate-500 mb-6">Publish content to see your performance metrics here.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('accounts')}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition"
              >
                Connect accounts
              </button>
              <button
                type="button"
                onClick={() => navigate('compose')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
              >
                Create post
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {sortedPosts.map((post) => {
              const platformIcon = platformIcons[post.platform];
              const Icon = platformIcon?.icon;
              const engagementBadge = getEngagementBadge(post.engagement_rate);

              return (
                <div key={post.id} className="p-6 hover:bg-slate-50 transition">
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-lg ${platformIcon?.bgColor || 'bg-slate-100'} flex items-center justify-center`}>
                      {Icon && <Icon className={`w-6 h-6 ${platformIcon.color}`} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-slate-900 truncate">{post.title || 'Untitled'}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${engagementBadge.bg} ${engagementBadge.text}`}>
                              {engagementBadge.label}
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(post.published_at)}
                            </span>
                          </div>
                        </div>
                        
                        {post.platform_post_id && (
                          <a
                            href={post.platform === 'youtube' 
                              ? `https://youtube.com/watch?v=${post.platform_post_id}`
                              : post.platform === 'instagram'
                              ? `https://instagram.com/p/${post.platform_post_id}`
                              : `https://tiktok.com/@user/video/${post.platform_post_id}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 p-2 hover:bg-slate-100 rounded-lg transition"
                          >
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                          </a>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-4 mt-4">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-900">{formatNumber(post.views)}</span>
                          <span className="text-xs text-slate-500">views</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Heart className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-900">{formatNumber(post.likes)}</span>
                          <span className="text-xs text-slate-500">likes</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-900">{formatNumber(post.comments)}</span>
                          <span className="text-xs text-slate-500">comments</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-900">
                            {post.views === 0 && (post.likes > 0 || post.comments > 0) ? '—' : `${post.engagement_rate}%`}
                          </span>
                          <span className="text-xs text-slate-500">engagement</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
