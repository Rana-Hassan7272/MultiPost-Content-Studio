import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TrendingUp, Eye, Heart, Share2, MessageCircle, Youtube, Instagram, Video } from 'lucide-react';

interface PlatformStats {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  posts: number;
}

export function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<PlatformStats[]>([]);
  const [topPosts, setTopPosts] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, [user]);

  const loadAnalytics = async () => {
    if (!user) return;

    try {
      const { data: platformPosts, error } = await supabase
        .from('platform_posts')
        .select(`
          *,
          posts!inner (
            user_id,
            title,
            platforms
          )
        `)
        .eq('posts.user_id', user.id);

      if (error) throw error;

      const stats: Record<string, PlatformStats> = {};
      const postsByPlatform: Record<string, any[]> = {};

      platformPosts?.forEach((pp: any) => {
        const platform = pp.platform;
        if (!stats[platform]) {
          stats[platform] = {
            platform,
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            posts: 0,
          };
        }
        stats[platform].views += pp.views || 0;
        stats[platform].likes += pp.likes || 0;
        stats[platform].comments += pp.comments || 0;
        stats[platform].shares += pp.shares || 0;
        stats[platform].posts += 1;

        if (!postsByPlatform[platform]) {
          postsByPlatform[platform] = [];
        }
        postsByPlatform[platform].push({
          ...pp,
          title: pp.posts.title,
          engagement: (pp.likes || 0) + (pp.comments || 0) + (pp.shares || 0),
        });
      });

      setPlatformStats(Object.values(stats));

      const allPosts = Object.values(postsByPlatform).flat();
      const sorted = allPosts.sort((a, b) => b.engagement - a.engagement);
      setTopPosts(sorted.slice(0, 5));
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalViews = platformStats.reduce((sum, s) => sum + s.views, 0);
  const totalLikes = platformStats.reduce((sum, s) => sum + s.likes, 0);
  const totalComments = platformStats.reduce((sum, s) => sum + s.comments, 0);
  const totalShares = platformStats.reduce((sum, s) => sum + s.shares, 0);

  const platformIcons: Record<string, any> = {
    youtube: { icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-50' },
    instagram: { icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-50' },
    tiktok: { icon: Video, color: 'text-cyan-500', bgColor: 'bg-cyan-50' },
  };

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
        <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-600 mt-2">Suivez les performances de vos publications</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Vues totales</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{totalViews.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-600">
              <Eye className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Likes totaux</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{totalLikes.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-pink-500/10 text-pink-600">
              <Heart className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Commentaires</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{totalComments.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-green-600">
              <MessageCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Partages</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{totalShares.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-orange-500/10 text-orange-600">
              <Share2 className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-900">Performance par plateforme</h2>
          </div>
          <div className="p-6 space-y-4">
            {platformStats.length === 0 ? (
              <p className="text-center text-slate-500 py-8">
                Aucune donnée disponible. Publiez du contenu pour voir vos statistiques.
              </p>
            ) : (
              platformStats.map((stat) => {
                const platformIcon = platformIcons[stat.platform];
                const Icon = platformIcon?.icon;
                return (
                  <div
                    key={stat.platform}
                    className={`p-4 rounded-lg ${platformIcon?.bgColor || 'bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {Icon && <Icon className={`w-5 h-5 ${platformIcon.color}`} />}
                      <span className="font-semibold text-slate-900 capitalize">{stat.platform}</span>
                      <span className="ml-auto text-sm text-slate-600">{stat.posts} publications</span>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-xs text-slate-600">Vues</p>
                        <p className="text-lg font-bold text-slate-900">{stat.views.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Likes</p>
                        <p className="text-lg font-bold text-slate-900">{stat.likes.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Comm.</p>
                        <p className="text-lg font-bold text-slate-900">{stat.comments.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Partages</p>
                        <p className="text-lg font-bold text-slate-900">{stat.shares.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-900">Top publications</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {topPosts.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Aucune publication avec des statistiques
              </div>
            ) : (
              topPosts.map((post, index) => {
                const platformIcon = platformIcons[post.platform];
                const Icon = platformIcon?.icon;
                return (
                  <div key={post.id} className="p-6 hover:bg-slate-50 transition">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {Icon && <Icon className={`w-4 h-4 ${platformIcon.color}`} />}
                          <h3 className="font-semibold text-slate-900 truncate">{post.title}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-600">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {post.views?.toLocaleString() || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {post.likes?.toLocaleString() || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {post.comments?.toLocaleString() || 0}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="flex items-center gap-1 text-green-600">
                          <TrendingUp className="w-4 h-4" />
                          <span className="text-sm font-semibold">{post.engagement}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
