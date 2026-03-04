import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  TrendingUp, 
  TrendingDown,
  Eye, 
  Heart, 
  Target,
  BarChart3,
  CheckCircle,
  XCircle,
  Youtube,
  Instagram,
  Video,
  ArrowRight,
  Zap
} from 'lucide-react';

interface PredictionRecord {
  id: string;
  title: string;
  platform: string;
  predicted_views_min: number;
  predicted_views_max: number;
  predicted_engagement: number;
  actual_views: number;
  actual_likes: number;
  actual_comments: number;
  published_at: string;
  accuracy: number;
}

const platformIcons: Record<string, any> = {
  youtube: { icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-50' },
  instagram: { icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-50' },
  tiktok: { icon: Video, color: 'text-cyan-500', bgColor: 'bg-cyan-50' },
};

export function PredictionDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [stats, setStats] = useState({
    totalPredictions: 0,
    accuratePredictions: 0,
    avgAccuracy: 0,
    bestPlatform: 'N/A',
  });

  useEffect(() => {
    loadPredictions();
  }, [user]);

  const loadPredictions = async () => {
    if (!user) return;

    try {
      const { data: platformPosts, error } = await supabase
        .from('platform_posts')
        .select(`
          *,
          posts!inner (
            user_id,
            title
          )
        `)
        .eq('posts.user_id', user.id)
        .eq('status', 'published')
        .not('platform_post_id', 'is', null)
        .not('published_at', 'is', null)
        .not('predicted_views_min', 'is', null);

      if (error) throw error;

      const records: PredictionRecord[] = (platformPosts || []).map(post => {
        const predictedMid = ((post.predicted_views_min || 0) + (post.predicted_views_max || 0)) / 2;
        const actualViews = post.views || 0;
        
        let accuracy = 0;
        if (predictedMid > 0) {
          const difference = Math.abs(actualViews - predictedMid);
          accuracy = Math.max(0, 100 - (difference / predictedMid) * 100);
        }

        return {
          id: post.id,
          title: post.posts?.title || 'Untitled',
          platform: post.platform,
          predicted_views_min: post.predicted_views_min || 0,
          predicted_views_max: post.predicted_views_max || 0,
          predicted_engagement: post.predicted_engagement || 0,
          actual_views: actualViews,
          actual_likes: post.likes || 0,
          actual_comments: post.comments || 0,
          published_at: post.published_at,
          accuracy: Math.round(accuracy)
        };
      });

      setPredictions(records);

      if (records.length > 0) {
        const accuratePredictions = records.filter(r => r.accuracy >= 70).length;
        const avgAccuracy = Math.round(records.reduce((sum, r) => sum + r.accuracy, 0) / records.length);

        const platformAccuracy: Record<string, number[]> = {};
        records.forEach(r => {
          if (!platformAccuracy[r.platform]) platformAccuracy[r.platform] = [];
          platformAccuracy[r.platform].push(r.accuracy);
        });

        let bestPlatform = 'N/A';
        let bestAvg = 0;
        Object.entries(platformAccuracy).forEach(([platform, accuracies]) => {
          const avg = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;
          if (avg > bestAvg) {
            bestAvg = avg;
            bestPlatform = platform;
          }
        });

        setStats({
          totalPredictions: records.length,
          accuratePredictions,
          avgAccuracy,
          bestPlatform
        });
      }
    } catch (error) {
      console.error('Error loading predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return 'text-green-600 bg-green-100';
    if (accuracy >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Prediction Accuracy</h1>
        <p className="text-slate-600 mt-2">Track how accurate your performance predictions have been</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Total Predictions</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{stats.totalPredictions}</p>
            </div>
            <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-600">
              <BarChart3 className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Accurate Predictions</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{stats.accuratePredictions}</p>
              <p className="text-xs text-slate-500 mt-1">70%+ accuracy</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-green-600">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Average Accuracy</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{stats.avgAccuracy}%</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-600">
              <Target className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Best Platform</p>
              <p className="text-3xl font-bold text-slate-900 mt-2 capitalize">{stats.bestPlatform}</p>
            </div>
            <div className="p-3 rounded-lg bg-cyan-500/10 text-cyan-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Prediction History</h2>
        </div>

        {predictions.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No Predictions Yet</h3>
            <p>Use the "Predict Performance" feature when creating posts to see accuracy tracking here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {predictions.map((prediction) => {
              const platformIcon = platformIcons[prediction.platform];
              const Icon = platformIcon?.icon;
              const wasAccurate = prediction.actual_views >= prediction.predicted_views_min && 
                                 prediction.actual_views <= prediction.predicted_views_max;

              return (
                <div key={prediction.id} className="p-6 hover:bg-slate-50 transition">
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-lg ${platformIcon?.bgColor || 'bg-slate-100'} flex items-center justify-center`}>
                      {Icon && <Icon className={`w-6 h-6 ${platformIcon.color}`} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-slate-900 truncate">{prediction.title}</h3>
                          <p className="text-sm text-slate-500 mt-1">{formatDate(prediction.published_at)}</p>
                        </div>
                        
                        <span className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-medium ${getAccuracyColor(prediction.accuracy)}`}>
                          {prediction.accuracy}% accurate
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">Predicted Views</p>
                          <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-700">
                              {formatNumber(prediction.predicted_views_min)} - {formatNumber(prediction.predicted_views_max)}
                            </span>
                          </div>
                        </div>
                        
                        <div className={`rounded-lg p-3 ${wasAccurate ? 'bg-green-50' : 'bg-orange-50'}`}>
                          <p className="text-xs text-slate-500 mb-1">Actual Views</p>
                          <div className="flex items-center gap-2">
                            {wasAccurate ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : prediction.actual_views > prediction.predicted_views_max ? (
                              <TrendingUp className="w-4 h-4 text-green-500" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-orange-500" />
                            )}
                            <span className={`font-medium ${wasAccurate ? 'text-green-700' : 'text-orange-700'}`}>
                              {formatNumber(prediction.actual_views)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-3 text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                          <Heart className="w-4 h-4" />
                          {formatNumber(prediction.actual_likes)} likes
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="w-4 h-4" />
                          {prediction.predicted_engagement}% predicted engagement
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white/20 rounded-lg">
            <Target className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Improve Prediction Accuracy</h3>
            <ul className="text-indigo-100 space-y-1">
              <li>• More posts = more accurate predictions</li>
              <li>• Consistent posting times help the algorithm learn</li>
              <li>• Follow the tips provided in predictions</li>
              <li>• Track which content types perform best</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
