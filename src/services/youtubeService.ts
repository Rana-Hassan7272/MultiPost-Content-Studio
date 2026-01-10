import { supabase } from '../lib/supabase';

export async function getYouTubeAuthUrl(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-oauth?action=auth_url`,
    {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  const { authUrl } = await response.json();
  return authUrl;
}

export async function refreshYouTubeToken(accountId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: account } = await supabase
    .from('connected_accounts')
    .select('refresh_token')
    .eq('id', accountId)
    .eq('user_id', session.user.id)
    .single();

  if (!account?.refresh_token) throw new Error('No refresh token');

  const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_YOUTUBE_CLIENT_SECRET;
  const redirectUri = import.meta.env.VITE_YOUTUBE_REDIRECT_URI || `${window.location.origin}/auth/youtube/callback`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: account.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) throw new Error('Token refresh failed');

  const tokens = await response.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

  await supabase
    .from('connected_accounts')
    .update({
      access_token: tokens.access_token,
      expires_at: expiresAt,
    })
    .eq('id', accountId);

  return tokens.access_token;
}

export async function getValidYouTubeToken(accountId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: account } = await supabase
    .from('connected_accounts')
    .select('access_token, expires_at, refresh_token')
    .eq('id', accountId)
    .eq('user_id', session.user.id)
    .single();

  if (!account) throw new Error('Account not found');

  if (account.expires_at && new Date(account.expires_at) > new Date()) {
    return account.access_token!;
  }

  return await refreshYouTubeToken(accountId);
}

