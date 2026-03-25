import { supabase } from '../lib/supabase';

export interface PerformancePrediction {
  viewsMin: number;
  viewsMax: number;
  expectedViews: number;
  engagementRate: number;
  likesEstimate: number;
  commentsEstimate: number;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  factors: PredictionFactor[];
  tips: string[];
  overallScore: number;
}

export interface PredictionFactor {
  name: string;
  score: number;
  maxScore: number;
  impact: 'positive' | 'neutral' | 'negative';
  suggestion?: string;
}

export interface ContentAnalysis {
  titleScore: number;
  descriptionScore: number;
  hashtagScore: number;
  timingScore: number;
  overallScore: number;
  suggestions: string[];
}

const PLATFORM_BENCHMARKS = {
  youtube: {
    avgViews: 500,
    avgEngagement: 4.5,
    optimalTitleLength: { min: 40, max: 70 },
    optimalDescLength: { min: 200, max: 2000 },
    optimalHashtags: { min: 3, max: 8 },
  },
  instagram: {
    avgViews: 300,
    avgEngagement: 6.0,
    optimalTitleLength: { min: 20, max: 100 },
    optimalDescLength: { min: 100, max: 500 },
    optimalHashtags: { min: 10, max: 25 },
  },
  tiktok: {
    avgViews: 1000,
    avgEngagement: 8.0,
    optimalTitleLength: { min: 10, max: 50 },
    optimalDescLength: { min: 50, max: 150 },
    optimalHashtags: { min: 3, max: 6 },
  },
};

export async function predictPerformance(
  platform: string,
  title: string,
  description: string,
  hashtags: string[],
  scheduledDay?: number,
  scheduledHour?: number,
  thumbnailBase64?: string,
  videoDuration?: number
): Promise<PerformancePrediction> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: pastPosts } = await supabase
    .from('platform_posts')
    .select(`
      *,
      posts!inner (
        user_id,
        title,
        description,
        tags
      )
    `)
    .eq('posts.user_id', session.user.id)
    .eq('platform', platform)
    .not('published_at', 'is', null);

  const posts = pastPosts || [];
  const benchmark = PLATFORM_BENCHMARKS[platform as keyof typeof PLATFORM_BENCHMARKS] || PLATFORM_BENCHMARKS.youtube;

  const factors: PredictionFactor[] = [];
  const tips: string[] = [];

  const titleScore = analyzeTitleQuality(title, benchmark);
  factors.push(titleScore.factor);
  if (titleScore.tip) tips.push(titleScore.tip);

  const descScore = analyzeDescriptionQuality(description, platform, benchmark);
  factors.push(descScore.factor);
  if (descScore.tip) tips.push(descScore.tip);

  const hashtagScore = analyzeHashtags(hashtags, benchmark);
  factors.push(hashtagScore.factor);
  if (hashtagScore.tip) tips.push(hashtagScore.tip);

  let timingScore: { factor: PredictionFactor; tip: string } = {
    factor: { name: 'Timing', score: 50, maxScore: 100, impact: 'neutral' },
    tip: '',
  };
  if (scheduledDay !== undefined && scheduledHour !== undefined) {
    timingScore = await analyzeTimingScore(session.user.id, platform, scheduledDay, scheduledHour, posts);
    factors.push(timingScore.factor);
    if (timingScore.tip) tips.push(timingScore.tip);
  }

  const historyScore = analyzeHistoricalPerformance(posts);
  factors.push(historyScore.factor);

  if (thumbnailBase64) {
    const thumbnailScore = await analyzeThumbnail(thumbnailBase64, platform);
    factors.push(thumbnailScore.factor);
    if (thumbnailScore.tip) tips.push(thumbnailScore.tip);
  }

  if (typeof videoDuration === 'number' && videoDuration > 0 && !Number.isNaN(videoDuration)) {
    const durationScore = analyzeVideoDuration(videoDuration, platform);
    factors.push(durationScore.factor);
    if (durationScore.tip) tips.push(durationScore.tip);
  }

  const emotionScore = analyzeTitleEmotion(title);
  factors.push(emotionScore.factor);
  if (emotionScore.tip) tips.push(emotionScore.tip);

  const consistencyScore = await analyzePostingConsistency(session.user.id, platform, posts);
  factors.push(consistencyScore.factor);
  if (consistencyScore.tip) tips.push(consistencyScore.tip);

  const totalScore = factors.reduce((sum, f) => sum + (Number.isFinite(f.score) ? f.score : 0), 0);
  const maxScore = factors.reduce((sum, f) => sum + (f.maxScore || 100), 0);
  const overallScore = Math.min(100, Math.max(0, Math.round((maxScore > 0 ? totalScore / maxScore : 0.5) * 100)));

  let baseViews = benchmark.avgViews;
  let baseEngagement = benchmark.avgEngagement;

  if (posts.length > 0) {
    const avgViews = posts.reduce((sum, p) => sum + (p.views || 0), 0) / posts.length;
    const totalEngagement = posts.reduce((sum, p) => sum + ((p.likes || 0) + (p.comments || 0)), 0);
    const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
    
    if (avgViews > 0) baseViews = avgViews;
    if (totalViews > 0) baseEngagement = (totalEngagement / totalViews) * 100;
  }

  const multiplier = 0.5 + (overallScore / 100);
  const expectedViews = Math.round(baseViews * multiplier);
  const variance = 0.4;
  const viewsMin = Math.round(expectedViews * (1 - variance));
  const viewsMax = Math.round(expectedViews * (1 + variance));

  const engagementRate = Math.round(baseEngagement * multiplier * 10) / 10;
  const likesEstimate = Math.round(expectedViews * (engagementRate / 100) * 0.7);
  const commentsEstimate = Math.round(expectedViews * (engagementRate / 100) * 0.3);

  let confidence: 'high' | 'medium' | 'low' = 'low';
  let confidenceScore = 30;
  
  if (posts.length >= 10) {
    confidence = 'high';
    confidenceScore = 85;
  } else if (posts.length >= 5) {
    confidence = 'medium';
    confidenceScore = 60;
  } else if (posts.length >= 2) {
    confidence = 'low';
    confidenceScore = 40;
  }

  if (tips.length === 0) {
    tips.push('Your content looks great! Keep up the good work.');
  }

  return {
    viewsMin,
    viewsMax,
    expectedViews,
    engagementRate,
    likesEstimate,
    commentsEstimate,
    confidence,
    confidenceScore,
    factors,
    tips,
    overallScore,
  };
}

function analyzeTitleQuality(title: string, benchmark: any): { factor: PredictionFactor; tip: string } {
  const length = title.length;
  const { min, max } = benchmark.optimalTitleLength;
  
  let score = 0;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  if (length === 0) {
    score = 0;
    impact = 'negative';
    tip = 'Add a title to improve discoverability';
  } else if (length >= min && length <= max) {
    score = 100;
    impact = 'positive';
  } else if (length < min) {
    score = Math.round((length / min) * 70);
    impact = 'negative';
    tip = `Title is short. Aim for ${min}-${max} characters for better engagement.`;
  } else {
    score = Math.round(Math.max(50, 100 - ((length - max) / max) * 50));
    impact = 'neutral';
    tip = `Title is long. Consider shortening to ${max} characters or less.`;
  }

  const hasEmoji = /[\u{1F600}-\u{1F6FF}]/u.test(title);
  const hasNumbers = /\d/.test(title);
  const hasPowerWords = /(new|official|exclusive|viral|trending|must|watch|now|best|top|amazing|incredible)/i.test(title);

  if (hasEmoji) score = Math.min(100, score + 5);
  if (hasNumbers) score = Math.min(100, score + 5);
  if (hasPowerWords) score = Math.min(100, score + 10);

  return {
    factor: { name: 'Title Quality', score, maxScore: 100, impact },
    tip
  };
}

function analyzeDescriptionQuality(description: string, platform: string, benchmark: any): { factor: PredictionFactor; tip: string } {
  const length = description.length;
  const { min, max } = benchmark.optimalDescLength;
  
  let score = 0;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  if (length === 0) {
    score = 20;
    impact = 'negative';
    tip = 'Add a description to improve SEO and engagement';
  } else if (length >= min && length <= max) {
    score = 100;
    impact = 'positive';
  } else if (length < min) {
    score = Math.round(20 + (length / min) * 60);
    impact = 'neutral';
    tip = `Description is short. Aim for ${min}+ characters for better SEO.`;
  } else {
    score = 80;
    impact = 'neutral';
  }

  const hasLinks = /(https?:\/\/|www\.)/i.test(description);
  const hasCallToAction = /(subscribe|follow|like|comment|share|click|check out|link in bio)/i.test(description);
  const hasTimestamps = /\d{1,2}:\d{2}/.test(description);

  if (hasLinks) score = Math.min(100, score + 5);
  if (hasCallToAction) score = Math.min(100, score + 10);
  if (hasTimestamps && platform === 'youtube') score = Math.min(100, score + 10);

  if (!hasCallToAction && score > 50) {
    tip = tip || 'Add a call-to-action (e.g., "Subscribe for more!") to boost engagement.';
  }

  return {
    factor: { name: 'Description Quality', score, maxScore: 100, impact },
    tip
  };
}

function analyzeHashtags(hashtags: string[], benchmark: any): { factor: PredictionFactor; tip: string } {
  const count = hashtags.filter(h => h.trim()).length;
  const { min, max } = benchmark.optimalHashtags;
  
  let score = 0;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  if (count === 0) {
    score = 30;
    impact = 'negative';
    tip = `Add ${min}-${max} relevant hashtags to increase discoverability.`;
  } else if (count >= min && count <= max) {
    score = 100;
    impact = 'positive';
  } else if (count < min) {
    score = Math.round(30 + (count / min) * 50);
    impact = 'neutral';
    tip = `Add more hashtags. Aim for ${min}-${max} for optimal reach.`;
  } else {
    score = Math.round(Math.max(60, 100 - ((count - max) / max) * 40));
    impact = 'neutral';
    tip = `Too many hashtags may look spammy. Aim for ${max} or fewer.`;
  }

  return {
    factor: { name: 'Hashtags', score, maxScore: 100, impact },
    tip
  };
}

async function analyzeTimingScore(
  _userId: string,
  platform: string,
  day: number,
  hour: number,
  posts: any[]
): Promise<{ factor: PredictionFactor; tip: string }> {
  let score = 50;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  if (posts.length < 3) {
    const optimalTimes: Record<string, { days: number[]; hours: number[] }> = {
      youtube: { days: [4, 5, 6], hours: [14, 15, 16, 17, 18] },
      instagram: { days: [1, 2, 3], hours: [11, 12, 13, 19, 20] },
      tiktok: { days: [1, 2, 3, 4], hours: [19, 20, 21, 22] },
    };

    const optimal = optimalTimes[platform] || optimalTimes.youtube;
    const isOptimalDay = optimal.days.includes(day);
    const isOptimalHour = optimal.hours.includes(hour);

    if (isOptimalDay && isOptimalHour) {
      score = 90;
      impact = 'positive';
    } else if (isOptimalDay || isOptimalHour) {
      score = 70;
      impact = 'neutral';
    } else {
      score = 40;
      impact = 'negative';
      tip = 'Consider posting during peak hours for better engagement.';
    }
  } else {
    const dayPerformance: Record<number, number> = {};
    const hourPerformance: Record<number, number> = {};

    posts.forEach(post => {
      if (!post.published_at) return;
      const publishedDate = new Date(post.published_at);
      const postDay = publishedDate.getDay();
      const postHour = publishedDate.getHours();
      const engagement = (post.views || 0) + ((post.likes || 0) * 5) + ((post.comments || 0) * 10);

      dayPerformance[postDay] = (dayPerformance[postDay] || 0) + engagement;
      hourPerformance[postHour] = (hourPerformance[postHour] || 0) + engagement;
    });

    const maxDayScore = Math.max(...Object.values(dayPerformance), 1);
    const maxHourScore = Math.max(...Object.values(hourPerformance), 1);

    const dayScore = ((dayPerformance[day] || 0) / maxDayScore) * 50;
    const hourScore = ((hourPerformance[hour] || 0) / maxHourScore) * 50;

    score = Math.round(dayScore + hourScore);
    
    if (score >= 70) {
      impact = 'positive';
    } else if (score >= 40) {
      impact = 'neutral';
    } else {
      impact = 'negative';
      const bestDay = Object.entries(dayPerformance).sort((a, b) => b[1] - a[1])[0];
      const bestHour = Object.entries(hourPerformance).sort((a, b) => b[1] - a[1])[0];
      if (bestDay && bestHour) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        tip = `Your best performing time is ${days[parseInt(bestDay[0])]} at ${bestHour[0]}:00`;
      }
    }
  }

  return {
    factor: { name: 'Timing', score, maxScore: 100, impact },
    tip
  };
}

function analyzeHistoricalPerformance(posts: any[]): { factor: PredictionFactor } {
  if (posts.length === 0) {
    return {
      factor: {
        name: 'Historical Data',
        score: 50,
        maxScore: 100,
        impact: 'neutral',
        suggestion: 'Publish more content to improve prediction accuracy'
      }
    };
  }

  const avgViews = posts.reduce((sum, p) => sum + (p.views || 0), 0) / posts.length;
  let score = 50;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';

  if (avgViews > 1000) {
    score = 90;
    impact = 'positive';
  } else if (avgViews > 500) {
    score = 75;
    impact = 'positive';
  } else if (avgViews > 100) {
    score = 60;
    impact = 'neutral';
  } else {
    score = 40;
    impact = 'neutral';
  }

  if (posts.length >= 10) score = Math.min(100, score + 10);

  return {
    factor: {
      name: 'Historical Performance',
      score,
      maxScore: 100,
      impact
    }
  };
}

async function analyzeThumbnail(thumbnailBase64: string, platform: string): Promise<{ factor: PredictionFactor; tip: string }> {
  let score = 50;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-content-generator`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: session.user.id,
          platform,
          contentType: 'analyze-thumbnail',
          videoThumbnail: thumbnailBase64,
        }),
      }
    );

    if (response.ok) {
      const analysis = await response.json();
      
      if (analysis.thumbnailScore !== undefined) {
        score = analysis.thumbnailScore;
        
        if (score >= 80) {
          impact = 'positive';
        } else if (score >= 50) {
          impact = 'neutral';
        } else {
          impact = 'negative';
        }
        
        if (analysis.thumbnailTips && analysis.thumbnailTips.length > 0) {
          tip = analysis.thumbnailTips[0];
        }
      }
    }
  } catch (error) {
    console.error('Thumbnail analysis failed:', error);
    score = 60;
    impact = 'neutral';
  }

  return {
    factor: { name: 'Thumbnail Quality', score, maxScore: 100, impact },
    tip
  };
}

function analyzeVideoDuration(durationSeconds: number, platform: string): { factor: PredictionFactor; tip: string } {
  let score = 50;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return {
      factor: { name: 'Video Duration', score: 50, maxScore: 100, impact: 'neutral' },
      tip: ''
    };
  }

  const optimalDurations: Record<string, { min: number; max: number; ideal: number }> = {
    youtube: { min: 480, max: 900, ideal: 600 },
    instagram: { min: 15, max: 90, ideal: 30 },
    tiktok: { min: 15, max: 60, ideal: 30 },
  };

  const optimal = optimalDurations[platform] || optimalDurations.youtube;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  const durationLabel = seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;

  if (durationSeconds >= optimal.min && durationSeconds <= optimal.max) {
    const distanceFromIdeal = Math.abs(durationSeconds - optimal.ideal);
    const maxDistance = Math.max(optimal.ideal - optimal.min, optimal.max - optimal.ideal);
    score = Math.round(100 - (distanceFromIdeal / maxDistance) * 20);
    score = Math.min(100, Math.max(0, score));
    impact = 'positive';
  } else if (durationSeconds < optimal.min) {
    score = Math.round((durationSeconds / optimal.min) * 60);
    score = Math.min(99, Math.max(1, score));
    impact = 'negative';
    if (platform === 'youtube') {
      tip = `Video is ${durationLabel}. YouTube often favors 8-15 min videos for better watch time.`;
    } else {
      tip = `Video is ${durationLabel}. Consider longer content for optimal ${platform} performance.`;
    }
  } else {
    score = Math.round(Math.max(40, 80 - ((durationSeconds - optimal.max) / optimal.max) * 40));
    score = Math.min(100, Math.max(0, score));
    impact = 'neutral';
    if (platform === 'youtube') {
      tip = `Video is ${durationLabel}. Consider if your audience will watch the full length.`;
    } else {
      tip = `Video is ${durationLabel}. Shorter clips often perform better on ${platform}.`;
    }
  }

  return {
    factor: { name: 'Video Duration', score, maxScore: 100, impact },
    tip
  };
}

function analyzeTitleEmotion(title: string): { factor: PredictionFactor; tip: string } {
  let score = 40;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  const curiosityWords = /(\?|how|why|what|when|secret|hidden|revealed|truth|unknown|mystery|discover|unbelievable|shocking)/i;
  const urgencyWords = /(now|today|urgent|limited|hurry|don't miss|last chance|breaking|just|finally)/i;
  const emotionalWords = /(amazing|incredible|insane|crazy|epic|mind-blowing|stunning|beautiful|heartbreaking|hilarious|terrifying)/i;
  const negativeWords = /(never|stop|don't|avoid|worst|bad|wrong|fail|mistake)/i;
  const numberPattern = /\b(\d+|one|two|three|four|five|ten|hundred)\b/i;
  const capsWords = title.match(/\b[A-Z]{2,}\b/g);

  let emotionPoints = 0;

  if (curiosityWords.test(title)) emotionPoints += 20;
  if (urgencyWords.test(title)) emotionPoints += 15;
  if (emotionalWords.test(title)) emotionPoints += 25;
  if (negativeWords.test(title)) emotionPoints += 10;
  if (numberPattern.test(title)) emotionPoints += 10;
  if (capsWords && capsWords.length >= 1 && capsWords.length <= 3) emotionPoints += 10;
  if (/[!]/.test(title)) emotionPoints += 5;
  if (/[\u{1F600}-\u{1F6FF}]/u.test(title)) emotionPoints += 10;

  score = Math.min(100, 40 + emotionPoints);

  if (score >= 75) {
    impact = 'positive';
  } else if (score >= 50) {
    impact = 'neutral';
  } else {
    impact = 'negative';
    tip = 'Add curiosity or emotional words to boost click-through rate.';
  }

  return {
    factor: { name: 'Title Emotion', score, maxScore: 100, impact },
    tip
  };
}

async function analyzePostingConsistency(_userId: string, _platform: string, posts: any[]): Promise<{ factor: PredictionFactor; tip: string }> {
  let score = 50;
  let impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  let tip = '';

  if (posts.length < 3) {
    score = 40;
    impact = 'neutral';
    tip = 'Post consistently to build audience expectations and algorithm favor.';
    return {
      factor: { name: 'Posting Consistency', score, maxScore: 100, impact },
      tip
    };
  }

  const sortedPosts = posts
    .filter(p => p.published_at)
    .sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());

  if (sortedPosts.length < 2) {
    return {
      factor: { name: 'Posting Consistency', score: 40, maxScore: 100, impact: 'neutral' },
      tip: 'Post more content to establish a consistent schedule.'
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < sortedPosts.length; i++) {
    const diff = new Date(sortedPosts[i].published_at).getTime() - new Date(sortedPosts[i-1].published_at).getTime();
    intervals.push(diff / (1000 * 60 * 60 * 24));
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  const coefficientOfVariation = (stdDev / avgInterval) * 100;

  if (coefficientOfVariation < 30) {
    score = 90;
    impact = 'positive';
  } else if (coefficientOfVariation < 60) {
    score = 70;
    impact = 'positive';
  } else if (coefficientOfVariation < 100) {
    score = 50;
    impact = 'neutral';
    tip = 'Try posting on a more regular schedule for better reach.';
  } else {
    score = 30;
    impact = 'negative';
    tip = 'Your posting schedule is irregular. Consistent posting improves algorithm ranking.';
  }

  const lastPost = sortedPosts[sortedPosts.length - 1];
  const daysSinceLastPost = (Date.now() - new Date(lastPost.published_at).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceLastPost > avgInterval * 2) {
    score = Math.max(20, score - 20);
    impact = 'negative';
    tip = `It's been ${Math.round(daysSinceLastPost)} days since your last post. Resume posting to maintain audience.`;
  }

  return {
    factor: { name: 'Posting Consistency', score, maxScore: 100, impact },
    tip
  };
}

export async function getAIContentAnalysis(
  title: string,
  description: string,
  platform: string
): Promise<ContentAnalysis> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-content-generator`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: session.user.id,
          platform,
          contentType: 'analyze',
          videoTitle: title,
          videoDescription: description,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('AI analysis failed');
    }

    return await response.json();
  } catch (error) {
    return {
      titleScore: 70,
      descriptionScore: 70,
      hashtagScore: 70,
      timingScore: 70,
      overallScore: 70,
      suggestions: ['Unable to get AI analysis. Using statistical prediction.']
    };
  }
}
