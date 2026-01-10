import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TrendingUp, Users, Eye, Heart, Calendar, FileText } from 'lucide-react';

export function Overview() {
  const { user } = useAuth();
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

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;

    try {
      const [postsResult, accountsResult, platformPostsResult] = await Promise.all([
        supabase.from('posts').select('*').eq('user_id', user.id),
        supabase.from('connected_accounts').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('posts').select(`
          *,
          platform_posts (
            views,
            likes,
            status
          )
        `).eq('user_id', user.id).order('created_at', { ascending: false }).limit(5)
      ]);

      const posts = postsResult.data || [];
      const accounts = accountsResult.data || [];

      let totalViews = 0;
      let totalLikes = 0;

      posts.forEach((post: any) => {
        post.platform_posts?.forEach((pp: any) => {
          totalViews += pp.views || 0;
          totalLikes += pp.likes || 0;
        });
      });

      setStats({
        totalPosts: posts.length,
        scheduledPosts: posts.filter(p => p.status === 'scheduled').length,
        publishedPosts: posts.filter(p => p.status === 'published').length,
        totalViews,
        totalLikes,
        connectedAccounts: accounts.length,
      });

      setRecentPosts(platformPostsResult.data || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Publications totales', value: stats.totalPosts, icon: FileText, color: 'blue' },
    { label: 'Planifiées', value: stats.scheduledPosts, icon: Calendar, color: 'orange' },
    { label: 'Vues totales', value: stats.totalViews.toLocaleString(), icon: Eye, color: 'green' },
    { label: 'Likes totaux', value: stats.totalLikes.toLocaleString(), icon: Heart, color: 'pink' },
    { label: 'Comptes connectés', value: stats.connectedAccounts, icon: Users, color: 'cyan' },
    { label: 'Publiées', value: stats.publishedPosts, icon: TrendingUp, color: 'emerald' },
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
        <h1 className="text-3xl font-bold text-slate-900">Tableau de bord</h1>
        <p className="text-slate-600 mt-2">Vue d'ensemble de votre activité</p>
      </div>

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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Publications récentes</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {recentPosts.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Aucune publication pour le moment. Créez votre première publication !
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
                        {post.status === 'published' ? 'Publiée' :
                         post.status === 'scheduled' ? 'Planifiée' : 'Brouillon'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(post.created_at).toLocaleDateString('fr-FR')}
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
