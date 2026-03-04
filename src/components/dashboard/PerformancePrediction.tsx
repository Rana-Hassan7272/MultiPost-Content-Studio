import { useState } from 'react';
import { 
  TrendingUp, 
  Eye, 
  Heart, 
  MessageCircle,
  Zap,
  AlertCircle,
  CheckCircle,
  Target,
  Lightbulb,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { predictPerformance, type PerformancePrediction as PredictionType } from '../../services/predictionService';

interface PerformancePredictionProps {
  platform: string;
  title: string;
  description: string;
  hashtags: string[];
  scheduledDay?: number;
  scheduledHour?: number;
  thumbnailBase64?: string;
  videoDuration?: number;
  onClose?: () => void;
}

export function PerformancePrediction({
  platform,
  title,
  description,
  hashtags,
  scheduledDay,
  scheduledHour,
  thumbnailBase64,
  videoDuration,
  onClose
}: PerformancePredictionProps) {
  const [prediction, setPrediction] = useState<PredictionType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await predictPerformance(
        platform,
        title,
        description,
        hashtags,
        scheduledDay,
        scheduledHour,
        thumbnailBase64,
        videoDuration
      );
      setPrediction(result);
    } catch (err: any) {
      setError(err.message || 'Failed to predict performance');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-red-600 bg-red-100';
      default: return 'text-slate-600 bg-slate-100';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'positive': return <ArrowUp className="w-4 h-4 text-green-500" />;
      case 'negative': return <ArrowDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (!prediction && !loading) {
    return (
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-200">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-100 rounded-lg">
            <BarChart3 className="w-8 h-8 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">Performance Prediction</h3>
            <p className="text-sm text-slate-600 mt-1">
              Get AI-powered predictions for views, engagement, and tips to improve your content.
            </p>
            <button
              onClick={runPrediction}
              disabled={!title || !platform}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Predict Performance
            </button>
            {(!title || !platform) && (
              <p className="text-xs text-slate-500 mt-2">Add a title and select a platform to predict</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-8 border border-slate-200 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-slate-600">Analyzing your content...</p>
        <p className="text-sm text-slate-500 mt-1">Calculating predicted performance</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-6 border border-red-200">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Prediction Failed</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
        <button
          onClick={runPrediction}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!prediction) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target className="w-8 h-8" />
            <div>
              <h3 className="text-xl font-bold">Performance Prediction</h3>
              <p className="text-indigo-100 text-sm">Based on your content and history</p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(prediction.confidence)}`}>
            {prediction.confidence === 'high' && <CheckCircle className="w-4 h-4 inline mr-1" />}
            {prediction.confidence === 'medium' && <AlertCircle className="w-4 h-4 inline mr-1" />}
            {prediction.confidence.charAt(0).toUpperCase() + prediction.confidence.slice(1)} Confidence
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Eye className="w-5 h-5 text-indigo-200" />
            </div>
            <p className="text-2xl font-bold">{formatNumber(prediction.expectedViews)}</p>
            <p className="text-xs text-indigo-200">Expected Views</p>
            <p className="text-xs text-indigo-300 mt-1">
              {formatNumber(prediction.viewsMin)} - {formatNumber(prediction.viewsMax)}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-5 h-5 text-indigo-200" />
            </div>
            <p className="text-2xl font-bold">{prediction.engagementRate}%</p>
            <p className="text-xs text-indigo-200">Engagement Rate</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Heart className="w-5 h-5 text-indigo-200" />
            </div>
            <p className="text-2xl font-bold">{formatNumber(prediction.likesEstimate)}</p>
            <p className="text-xs text-indigo-200">Expected Likes</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <MessageCircle className="w-5 h-5 text-indigo-200" />
            </div>
            <p className="text-2xl font-bold">{formatNumber(prediction.commentsEstimate)}</p>
            <p className="text-xs text-indigo-200">Expected Comments</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-slate-900">Overall Score</h4>
            <span className="text-2xl font-bold text-indigo-600">{prediction.overallScore}/100</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
            <div 
              className={`h-full ${getScoreColor(prediction.overallScore)} transition-all duration-500`}
              style={{ width: `${prediction.overallScore}%` }}
            />
          </div>
        </div>

        <div className="mb-6">
          <h4 className="font-semibold text-slate-900 mb-3">Content Factors</h4>
          <div className="space-y-3">
            {prediction.factors.map((factor, index) => (
              <div key={index} className="flex items-center gap-3">
                {getImpactIcon(factor.impact)}
                <span className="flex-1 text-sm text-slate-700">{factor.name}</span>
                <div className="w-32 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full ${getScoreColor(factor.score)}`}
                    style={{ width: `${factor.score}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-900 w-12 text-right">
                  {factor.score}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {prediction.tips.length > 0 && (
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900 mb-2">Tips to Improve</h4>
                <ul className="space-y-1">
                  {prediction.tips.map((tip, index) => (
                    <li key={index} className="text-sm text-amber-800">• {tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={runPrediction}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Recalculate
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
