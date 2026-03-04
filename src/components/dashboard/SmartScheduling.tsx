import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Clock, 
  Calendar, 
  TrendingUp, 
  Zap,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Youtube,
  Instagram,
  Video
} from 'lucide-react';
import { 
  calculateOptimalPostingTimes, 
  getPostingTimeInsights,
  type OptimalTimeRecommendation,
  type PostingTimeInsight
} from '../../services/analyticsService';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const platformIcons: Record<string, any> = {
  youtube: { icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-50' },
  instagram: { icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-50' },
  tiktok: { icon: Video, color: 'text-cyan-500', bgColor: 'bg-cyan-50' },
};

export function SmartScheduling() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState<OptimalTimeRecommendation[]>([]);
  const [insights, setInsights] = useState<PostingTimeInsight[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');

  useEffect(() => {
    loadInsights();
  }, [user]);

  const loadInsights = async () => {
    if (!user) return;
    
    try {
      const data = await getPostingTimeInsights();
      setInsights(data);
      
      if (data.length > 0) {
        const recs = data.map(insight => ({
          platform: insight.platform,
          bestDays: insight.best_days?.map((d, i) => ({
            day: d,
            dayName: DAY_FULL_NAMES[d],
            score: 100 - i * 20
          })) || [],
          bestHours: insight.best_hours?.map((h, i) => ({
            hour: h,
            label: `${h.toString().padStart(2, '0')}:00`,
            score: 100 - i * 15
          })) || [],
          recommendation: `Best time for ${insight.platform}: ${DAY_FULL_NAMES[insight.best_days?.[0] || 0]} at ${(insight.best_hours?.[0] || 12).toString().padStart(2, '0')}:00`,
          confidence: insight.sample_size >= 10 ? 'high' : insight.sample_size >= 5 ? 'medium' : 'low' as 'high' | 'medium' | 'low'
        }));
        setRecommendations(recs);
      }
    } catch (error) {
      console.error('Error loading insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzePostingTimes = async () => {
    setAnalyzing(true);
    try {
      const recs = await calculateOptimalPostingTimes();
      setRecommendations(recs);
      await loadInsights();
    } catch (error) {
      console.error('Error analyzing posting times:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const getTimeOfDayIcon = (hour: number) => {
    if (hour >= 5 && hour < 12) return <Sunrise className="w-4 h-4 text-orange-500" />;
    if (hour >= 12 && hour < 17) return <Sun className="w-4 h-4 text-yellow-500" />;
    if (hour >= 17 && hour < 21) return <Sunset className="w-4 h-4 text-orange-600" />;
    return <Moon className="w-4 h-4 text-indigo-500" />;
  };

  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    const badges = {
      high: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'High Confidence' },
      medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: AlertCircle, label: 'Medium Confidence' },
      low: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle, label: 'Low Confidence' }
    };
    const badge = badges[confidence];
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const filteredRecommendations = selectedPlatform === 'all' 
    ? recommendations 
    : recommendations.filter(r => r.platform === selectedPlatform);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Smart Scheduling</h1>
          <p className="text-slate-600 mt-2">AI-powered optimal posting time recommendations</p>
        </div>
        <button
          onClick={analyzePostingTimes}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${analyzing ? 'animate-spin' : ''}`} />
          {analyzing ? 'Analyzing...' : 'Analyze Now'}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSelectedPlatform('all')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            selectedPlatform === 'all' 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          All Platforms
        </button>
        {['youtube', 'instagram', 'tiktok'].map(platform => {
          const platformIcon = platformIcons[platform];
          const Icon = platformIcon?.icon;
          return (
            <button
              key={platform}
              onClick={() => setSelectedPlatform(platform)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition capitalize ${
                selectedPlatform === platform 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {Icon && <Icon className={`w-4 h-4 ${selectedPlatform === platform ? 'text-white' : platformIcon.color}`} />}
              {platform}
            </button>
          );
        })}
      </div>

      {recommendations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No Data Yet</h3>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Publish more content to get AI-powered recommendations for optimal posting times.
          </p>
          <button
            onClick={analyzePostingTimes}
            disabled={analyzing}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition"
          >
            Run Analysis
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredRecommendations.map(rec => {
            const platformIcon = platformIcons[rec.platform];
            const Icon = platformIcon?.icon;
            
            return (
              <div key={rec.platform} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className={`p-6 ${platformIcon?.bgColor || 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {Icon && <Icon className={`w-8 h-8 ${platformIcon.color}`} />}
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 capitalize">{rec.platform}</h3>
                        <p className="text-sm text-slate-600">{rec.recommendation}</p>
                      </div>
                    </div>
                    {getConfidenceBadge(rec.confidence)}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Best Days to Post
                    </h4>
                    <div className="flex gap-2">
                      {DAY_NAMES.map((day, index) => {
                        const isTop = rec.bestDays.some(d => d.day === index);
                        const rank = rec.bestDays.findIndex(d => d.day === index) + 1;
                        return (
                          <div
                            key={day}
                            className={`flex-1 py-3 rounded-lg text-center transition ${
                              isTop 
                                ? rank === 1 
                                  ? 'bg-green-100 text-green-800 font-bold' 
                                  : rank === 2 
                                  ? 'bg-green-50 text-green-700 font-medium' 
                                  : 'bg-slate-100 text-slate-700'
                                : 'bg-slate-50 text-slate-400'
                            }`}
                          >
                            <span className="text-xs">{day}</span>
                            {rank > 0 && rank <= 3 && (
                              <div className="text-xs mt-1">#{rank}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Best Hours to Post
                    </h4>
                    {rec.bestHours.length > 0 ? (
                      <div className="space-y-2">
                        {rec.bestHours.slice(0, 3).map((hour, index) => (
                          <div 
                            key={hour.hour} 
                            className={`flex items-center gap-3 p-3 rounded-lg ${
                              index === 0 ? 'bg-green-50' : 'bg-slate-50'
                            }`}
                          >
                            {getTimeOfDayIcon(hour.hour)}
                            <span className="font-medium text-slate-900">{hour.label}</span>
                            <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full ${index === 0 ? 'bg-green-500' : 'bg-slate-400'}`}
                                style={{ width: `${hour.score}%` }}
                              />
                            </div>
                            <span className="text-sm text-slate-600">{hour.score}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">Not enough data</p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span>
                        Based on {insights.find(i => i.platform === rec.platform)?.sample_size || 0} posts
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white/20 rounded-lg">
            <TrendingUp className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Pro Tip</h3>
            <p className="text-blue-100">
              The more content you publish, the more accurate your optimal posting time recommendations become. 
              Aim for at least 10 posts per platform to get high-confidence recommendations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
