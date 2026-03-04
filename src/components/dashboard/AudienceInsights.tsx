import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Users, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  PieChart,
  Target,
  Zap,
  Youtube,
  Instagram,
  Video,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { getAudienceInsights } from '../../services/analyticsService';

const platformIcons: Record<string, any> = {
  youtube: { icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-500' },
  instagram: { icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-500' },
  tiktok: { icon: Video, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
};

export function AudienceInsights() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<{
    totalReach: number;
    avgEngagement: number;
    topPlatform: string;
    growthRate: number;
    platformBreakdown: { platform: string; percentage: number; views: number }[];
  } | null>(null);

  useEffect(() => {
    loadInsights();
  }, [user]);

  const loadInsights = async () => {
    if (!user) return;
    
    try {
      const data = await getAudienceInsights();
      setInsights(data);
    } catch (error) {
      console.error('Error loading audience insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getGrowthIcon = (rate: number) => {
    if (rate > 0) return <ArrowUp className="w-4 h-4 text-green-500" />;
    if (rate < 0) return <ArrowDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const getGrowthColor = (rate: number) => {
    if (rate > 0) return 'text-green-600';
    if (rate < 0) return 'text-red-600';
    return 'text-slate-600';
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
        <h1 className="text-3xl font-bold text-slate-900">Audience Insights</h1>
        <p className="text-slate-600 mt-2">Understand your audience and track your growth</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Total Reach</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                {formatNumber(insights?.totalReach || 0)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-600">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Avg Engagement Rate</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                {insights?.avgEngagement || 0}%
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-green-600">
              <Target className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Top Platform</p>
              <p className="text-3xl font-bold text-slate-900 mt-2 capitalize">
                {insights?.topPlatform || 'N/A'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-600">
              <BarChart3 className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Growth Rate</p>
              <div className="flex items-center gap-2 mt-2">
                <p className={`text-3xl font-bold ${getGrowthColor(insights?.growthRate || 0)}`}>
                  {insights?.growthRate || 0}%
                </p>
                {getGrowthIcon(insights?.growthRate || 0)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-orange-500/10 text-orange-600">
              {(insights?.growthRate || 0) >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-slate-600" />
              <h2 className="text-xl font-bold text-slate-900">Platform Breakdown</h2>
            </div>
          </div>
          <div className="p-6">
            {insights?.platformBreakdown && insights.platformBreakdown.length > 0 ? (
              <div className="space-y-4">
                {insights.platformBreakdown.map(platform => {
                  const platformIcon = platformIcons[platform.platform];
                  const Icon = platformIcon?.icon;
                  return (
                    <div key={platform.platform} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {Icon && <Icon className={`w-5 h-5 ${platformIcon.color}`} />}
                          <span className="font-medium text-slate-900 capitalize">{platform.platform}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">{formatNumber(platform.views)} views</span>
                          <span className="font-bold text-slate-900">{platform.percentage}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-full ${platformIcon?.bgColor || 'bg-slate-500'} transition-all duration-500`}
                          style={{ width: `${platform.percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <PieChart className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No platform data available</p>
                <p className="text-sm mt-1">Publish content to see your platform breakdown</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-slate-600" />
              <h2 className="text-xl font-bold text-slate-900">Quick Stats</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Total Views</span>
              <span className="font-bold text-slate-900">{formatNumber(insights?.totalReach || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Engagement Rate</span>
              <span className="font-bold text-slate-900">{insights?.avgEngagement || 0}%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Monthly Growth</span>
              <span className={`font-bold ${getGrowthColor(insights?.growthRate || 0)}`}>
                {(insights?.growthRate || 0) > 0 ? '+' : ''}{insights?.growthRate || 0}%
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Best Performing</span>
              <span className="font-bold text-slate-900 capitalize">{insights?.topPlatform || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white/20 rounded-lg">
            <Target className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Engagement Tips</h3>
            <ul className="text-purple-100 space-y-1">
              <li>• Post consistently to maintain audience engagement</li>
              <li>• Use trending hashtags to increase discoverability</li>
              <li>• Engage with comments to boost your algorithm ranking</li>
              <li>• Analyze your top-performing content and create similar posts</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
