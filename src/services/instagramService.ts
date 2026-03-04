import { supabase } from '../lib/supabase';

export async function getInstagramAuthUrl(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated. Please sign in again.');
  }

  const appId = import.meta.env.VITE_META_APP_ID;
  let redirectUri = import.meta.env.VITE_META_REDIRECT_URI || `${window.location.origin}/`;
  redirectUri = redirectUri.trim();
  if (!redirectUri.endsWith('/')) {
    redirectUri = redirectUri + '/';
  }

  if (!appId) {
    throw new Error('Instagram (Meta App ID) not configured');
  }

  const state = `instagram_${session.user.id}`;
  const scope = 'public_profile,pages_show_list,pages_read_engagement,business_management,instagram_basic,instagram_content_publish,instagram_manage_insights';
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
  return authUrl;
}

export function isInstagramConfigured(): boolean {
  return !!(import.meta.env.VITE_META_APP_ID && import.meta.env.VITE_META_APP_ID.trim());
}
