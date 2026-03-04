import { supabase } from '../lib/supabase';

export interface PostingTimeInsight {
  id: string;
  user_id: string;
  platform: string;
  best_days: number[];
  best_hours: number[];
  average_views: number;
  average_engagement: number;
  engagement_score: number;
  sample_size: number;
  last_updated: string;
}

export interface PostPerformance {
  id: string;
  post_id: string;
  platform: string;
  platform_post_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  published_at: string;
  title: string;
  engagement_rate: number;
}

export interface OptimalTimeRecommendation {
  platform: string;
  bestDays: { day: number; dayName: string; score: number }[];
  bestHours: { hour: number; label: string; score: number }[];
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function getPostingTimeInsights(platform?: string): Promise<PostingTimeInsight[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  let query = supabase
    .from('posting_time_insights')
    .select('*')
    .eq('user_id', session.user.id);

  if (platform) {
    query = query.eq('platform', platform);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getPostPerformance(): Promise<PostPerformance[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('platform_posts')
    .select(`
      *,
      posts!inner (
        user_id,
        title
      )
    `)
    .eq('posts.user_id', session.user.id)
    .eq('status', 'published')
    .not('platform_post_id', 'is', null)
    .order('published_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(post => ({
    id: post.id,
    post_id: post.post_id,
    platform: post.platform,
    platform_post_id: post.platform_post_id,
    views: post.views || 0,
    likes: post.likes || 0,
    comments: post.comments || 0,
    shares: post.shares || 0,
    published_at: post.published_at,
    title: post.posts?.title || '',
    engagement_rate: calculateEngagementRate(post.views || 0, post.likes || 0, post.comments || 0, post.shares || 0)
  }));
}

function calculateEngagementRate(views: number, likes: number, comments: number, shares: number): number {
  if (views === 0) return 0;
  const totalEngagement = likes + comments + shares;
  return Math.round((totalEngagement / views) * 10000) / 100;
}

export async function calculateOptimalPostingTimes(): Promise<OptimalTimeRecommendation[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: platformPosts, error } = await supabase
    .from('platform_posts')
    .select(`
      *,
      posts!inner (
        user_id
      )
    `)
    .eq('posts.user_id', session.user.id)
    .eq('status', 'published')
    .not('published_at', 'is', null);

  if (error) throw error;

  const platformData: Record<string, any[]> = {};
  
  (platformPosts || []).forEach(post => {
    if (!platformData[post.platform]) {
      platformData[post.platform] = [];
    }
    platformData[post.platform].push(post);
  });

  const recommendations: OptimalTimeRecommendation[] = [];

  for (const [platform, posts] of Object.entries(platformData)) {
    if (posts.length === 0) continue;

    const dayPerformance: Record<number, { views: number; engagement: number; count: number }> = {};
    const hourPerformance: Record<number, { views: number; engagement: number; count: number }> = {};

    for (let i = 0; i < 7; i++) {
      dayPerformance[i] = { views: 0, engagement: 0, count: 0 };
    }
    for (let i = 0; i < 24; i++) {
      hourPerformance[i] = { views: 0, engagement: 0, count: 0 };
    }

    posts.forEach(post => {
      if (!post.published_at) return;
      
      const publishedDate = new Date(post.published_at);
      const day = publishedDate.getDay();
      const hour = publishedDate.getHours();
      const engagement = (post.likes || 0) + (post.comments || 0) + (post.shares || 0);

      dayPerformance[day].views += post.views || 0;
      dayPerformance[day].engagement += engagement;
      dayPerformance[day].count += 1;

      hourPerformance[hour].views += post.views || 0;
      hourPerformance[hour].engagement += engagement;
      hourPerformance[hour].count += 1;
    });

    const bestDays = Object.entries(dayPerformance)
      .map(([day, data]) => ({
        day: parseInt(day),
        dayName: DAY_NAMES[parseInt(day)],
        score: data.count > 0 ? Math.round((data.views + data.engagement * 10) / data.count) : 0
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const bestHours = Object.entries(hourPerformance)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        label: `${parseInt(hour).toString().padStart(2, '0')}:00`,
        score: data.count > 0 ? Math.round((data.views + data.engagement * 10) / data.count) : 0
      }))
      .filter(h => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const confidence = posts.length >= 10 ? 'high' : posts.length >= 5 ? 'medium' : 'low';

    let recommendation = '';
    if (bestDays.length > 0 && bestHours.length > 0) {
      recommendation = `Best time to post on ${platform}: ${bestDays[0].dayName} at ${bestHours[0].label}`;
    } else {
      recommendation = `Not enough data for ${platform}. Post more to get recommendations.`;
    }

    recommendations.push({
      platform,
      bestDays,
      bestHours,
      recommendation,
      confidence
    });

    await supabase
      .from('posting_time_insights')
      .upsert({
        user_id: session.user.id,
        platform,
        best_days: bestDays.map(d => d.day),
        best_hours: bestHours.map(h => h.hour),
        average_views: Math.round(posts.reduce((sum, p) => sum + (p.views || 0), 0) / posts.length),
        average_engagement: Math.round(posts.reduce((sum, p) => sum + ((p.likes || 0) + (p.comments || 0) + (p.shares || 0)), 0) / posts.length * 100) / 100,
        sample_size: posts.length,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });
  }

  return recommendations;
}

export async function getRecommendedPostingTime(platform: string): Promise<{ day: number; hour: number; label: string } | null> {
  const insights = await getPostingTimeInsights(platform);
  
  if (insights.length === 0 || !insights[0].best_days?.length || !insights[0].best_hours?.length) {
    const defaults: Record<string, { day: number; hour: number }> = {
      youtube: { day: 5, hour: 17 },
      instagram: { day: 3, hour: 12 },
      tiktok: { day: 2, hour: 19 }
    };
    
    const defaultTime = defaults[platform] || { day: 5, hour: 12 };
    return {
      day: defaultTime.day,
      hour: defaultTime.hour,
      label: `${DAY_NAMES[defaultTime.day]} at ${defaultTime.hour.toString().padStart(2, '0')}:00`
    };
  }

  const bestDay = insights[0].best_days[0];
  const bestHour = insights[0].best_hours[0];

  return {
    day: bestDay,
    hour: bestHour,
    label: `${DAY_NAMES[bestDay]} at ${bestHour.toString().padStart(2, '0')}:00`
  };
}

export async function getAudienceInsights(): Promise<{
  totalReach: number;
  avgEngagement: number;
  topPlatform: string;
  growthRate: number;
  platformBreakdown: { platform: string; percentage: number; views: number }[];
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: platformPosts, error } = await supabase
    .from('platform_posts')
    .select(`
      *,
      posts!inner (
        user_id
      )
    `)
    .eq('posts.user_id', session.user.id)
    .eq('status', 'published')
    .not('platform_post_id', 'is', null);

  if (error) throw error;

  const posts = platformPosts || [];
  const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
  const totalEngagement = posts.reduce((sum, p) => sum + ((p.likes || 0) + (p.comments || 0) + (p.shares || 0)), 0);

  const platformViews: Record<string, number> = {};
  posts.forEach(p => {
    platformViews[p.platform] = (platformViews[p.platform] || 0) + (p.views || 0);
  });

  const platformBreakdown = Object.entries(platformViews)
    .map(([platform, views]) => ({
      platform,
      views,
      percentage: totalViews > 0 ? Math.round((views / totalViews) * 100) : 0
    }))
    .sort((a, b) => b.views - a.views);

  const topPlatform = platformBreakdown.length > 0 ? platformBreakdown[0].platform : 'N/A';

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  
  const recentPosts = posts.filter(p => p.published_at && new Date(p.published_at) >= lastMonth);
  const olderPosts = posts.filter(p => p.published_at && new Date(p.published_at) < lastMonth);

  const recentViews = recentPosts.reduce((sum, p) => sum + (p.views || 0), 0);
  const olderViews = olderPosts.reduce((sum, p) => sum + (p.views || 0), 0);

  const growthRate = olderViews > 0 
    ? Math.round(((recentViews - olderViews) / olderViews) * 100) 
    : recentViews > 0 ? 100 : 0;

  return {
    totalReach: totalViews,
    avgEngagement: totalViews > 0 ? Math.round((totalEngagement / totalViews) * 10000) / 100 : 0,
    topPlatform,
    growthRate,
    platformBreakdown
  };
}
