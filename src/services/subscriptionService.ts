import { supabase } from '../lib/supabase';
import { type PlanType } from '../lib/planLimits';

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: PlanType;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete';
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface Usage {
  postsThisMonth: number;
  aiGenerationsThisMonth: number;
  storageUsedBytes: number;
  mediaLibraryCount: number;
  connectedAccountsCount: number;
  voiceProfilesCount: number;
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, plan_type, status, current_period_end, stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Subscription | null;
}

export async function getEffectivePlan(userId: string): Promise<PlanType> {
  const sub = await getSubscription(userId);
  if (!sub || sub.status !== 'active') return 'free';
  if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) return 'free';
  return sub.plan_type as PlanType;
}

export async function getUsage(userId: string): Promise<Usage> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: postsThisMonth },
    { count: aiGenerationsThisMonth },
    { data: mediaRows },
    { count: connectedAccountsCount },
    { count: voiceProfilesCount },
  ] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', startOfMonth),
    supabase.from('ai_content_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', startOfMonth),
    supabase.from('media_library').select('file_size').eq('user_id', userId),
    supabase.from('connected_accounts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
    supabase.from('voice_profiles').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const storageUsedBytes = (mediaRows || []).reduce((sum: number, r: { file_size?: number }) => sum + (Number(r.file_size) || 0), 0);
  const mediaLibraryCount = (mediaRows || []).length;

  return {
    postsThisMonth: postsThisMonth ?? 0,
    aiGenerationsThisMonth: aiGenerationsThisMonth ?? 0,
    storageUsedBytes,
    mediaLibraryCount,
    connectedAccountsCount: connectedAccountsCount ?? 0,
    voiceProfilesCount: voiceProfilesCount ?? 0,
  };
}

export async function activatePlanForTesting(planType: 'starter' | 'pro'): Promise<{ url?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/subscription-activate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planType }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: data.error || data.message || 'Failed to activate plan' };
  return { url: data.url };
}

export async function createCheckoutSession(planType: 'starter' | 'pro'): Promise<{ url?: string; sessionId?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planType }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: data.error || data.message || 'Checkout failed' };
  if (data.url) return { url: data.url };
  if (data.sessionId) return { sessionId: data.sessionId };
  return { error: 'No redirect URL' };
}
