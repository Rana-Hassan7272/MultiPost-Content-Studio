import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboardNav } from '../../contexts/DashboardNavContext';
import { TrendingUp, Users, Eye, Heart, Calendar, FileText, Clock, BarChart3, Link2, FilePlus } from 'lucide-react';
import { getRecommendedPostingTime, getAudienceInsights } from '../../services/analyticsService';

export function Overview() {
  const { user } = useAuth();
  const navigate = useDashboardNav();
  const [stats, setStats] = useState({
    totalPosts: 0,
    scheduledPosts: 0,
    publishedPosts: 0,
    totalViews: 0,
    totalLikes: 0,
    connectedAccounts: 0,
  });
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendedTime, setRecommendedTime] = useState<{ day: number; hour: number; label: string } | null>(null);
  const [audienceInsights, setAudienceInsights] = useState<{ growthRate: number; avgEngagement: number } | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;

    try {
      const [postsResult, accountsResult, platformPostsResult] = await Promise.all([
        supabase.from('posts').select('id, status').eq('user_id', user.id),
        supabase.from('connected_accounts').select('id').eq('user_id', user.id).eq('is_active', true),
        supabase.from('platform_posts').select(`
          views,
          likes,
          comments,
          status,
          platform_post_id,
          posts!inner ( user_id )
        `).eq('posts.user_id', user.id).eq('status', 'published').not('platform_post_id', 'is', null)
      ]);

      const posts = postsResult.data || [];
      const accounts = accountsResult.data || [];
      const platformPosts = platformPostsResult.data || [];

      const totalViews = platformPosts.reduce((sum: number, pp: any) => sum + (Number(pp.views) || 0), 0);
      const totalLikes = platformPosts.reduce((sum: number, pp: any) => sum + (Number(pp.likes) || 0), 0);

      setStats({
        totalPosts: posts.length,
        scheduledPosts: posts.filter((p: any) => p.status === 'scheduled').length,
        publishedPosts: posts.filter((p: any) => p.status === 'published').length,
        totalViews,
        totalLikes,
        connectedAccounts: accounts.length,
      });

      const recentPostsQuery = await supabase
        .from('posts')
        .select(`
          id,
          title,
          description,
          status,
          platforms,
          created_at,
          platform_posts ( views, likes, status, platform_post_id )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const recentPostsList = recentPostsQuery.data || [];
      setRecentPosts(
        recentPostsList.filter((post: any) =>
          post.platform_posts?.some((pp: any) => pp.status === 'published' && pp.platform_post_id)
        )
      );

      try {
        const [ytRecommendation, insights] = await Promise.all([
          getRecommendedPostingTime('youtube'),
          getAudienceInsights()
        ]);
        setRecommendedTime(ytRecommendation);
        setAudienceInsights({ growthRate: insights.growthRate, avgEngagement: insights.avgEngagement });
      } catch (err) {
        console.log('Could not load analytics insights');
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total publications', value: stats.totalPosts, icon: FileText, color: 'blue' },
    { label: 'Planned', value: stats.scheduledPosts, icon: Calendar, color: 'orange' },
    { label: 'Total views', value: stats.totalViews.toLocaleString(), icon: Eye, color: 'green' },
    { label: 'Total likes', value: stats.totalLikes.toLocaleString(), icon: Heart, color: 'pink' },
    { label: 'Connected accounts', value: stats.connectedAccounts, icon: Users, color: 'cyan' },
    { label: 'Published', value: stats.publishedPosts, icon: TrendingUp, color: 'emerald' },
  ];

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-600',
    orange: 'bg-orange-500/10 text-orange-600',
    green: 'bg-green-500/10 text-green-600',
    pink: 'bg-pink-500/10 text-pink-600',
    cyan: 'bg-cyan-500/10 text-cyan-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-2">Overview of your business</p>
      </div>

      {stats.connectedAccounts === 0 ? (
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border-2 border-dashed border-blue-200 p-12 text-center">
          <div className="inline-flex p-4 rounded-full bg-blue-100 text-blue-600 mb-4">
            <Link2 className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Connect your first account</h2>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Link your YouTube or Instagram account to publish and track your stats in one place.
          </p>
          <button
            onClick={() => navigate('accounts')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition"
          >
            <Link2 className="w-5 h-5" />
            Linked accounts
          </button>
        </div>
      ) : stats.totalPosts === 0 ? (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border-2 border-dashed border-emerald-200 p-12 text-center">
          <div className="inline-flex p-4 rounded-full bg-emerald-100 text-emerald-600 mb-4">
            <FilePlus className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Create your first post</h2>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Write a post and publish to YouTube or Instagram, or schedule it for later.
          </p>
          <button
            onClick={() => navigate('compose')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition"
          >
            <FilePlus className="w-5 h-5" />
            Create post
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-xl p-6 border border-slate-200 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${colorClasses[stat.color]}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {recommendedTime && (
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-lg">
                <Clock className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">Best Time to Post</h3>
                <p className="text-blue-100 text-sm mb-3">Based on your audience engagement</p>
                <p className="text-2xl font-bold">{recommendedTime.label}</p>
              </div>
            </div>
          </div>
        )}
        
        {audienceInsights && (
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-lg">
                <BarChart3 className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">Quick Insights</h3>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <p className="text-purple-100 text-xs">Growth Rate</p>
                    <p className="text-2xl font-bold">{audienceInsights.growthRate > 0 ? '+' : ''}{audienceInsights.growthRate}%</p>
                  </div>
                  <div>
                    <p className="text-purple-100 text-xs">Avg Engagement</p>
                    <p className="text-2xl font-bold">{audienceInsights.avgEngagement}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Recent posts</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {recentPosts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 mb-4">No posts yet.</p>
              <button
                onClick={() => navigate('compose')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
              >
                <FilePlus className="w-4 h-4" />
                Create post
              </button>
            </div>
          ) : (
            recentPosts.map((post) => (
              <div key={post.id} className="p-6 hover:bg-slate-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{post.title}</h3>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{post.description}</p>
                    <div className="flex items-center gap-4 mt-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        post.status === 'published' ? 'bg-green-100 text-green-800' :
                        post.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {post.status === 'published' ? 'Published' :
                         post.status === 'scheduled' ? 'Planned' : 'Draft'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {post.platforms?.map((platform: string) => (
                      <div
                        key={platform}
                        className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-medium"
                      >
                        {platform.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
