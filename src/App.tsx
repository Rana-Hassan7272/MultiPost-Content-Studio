import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { LandingPage } from './components/LandingPage';
import { supabase } from './lib/supabase';

/** Handles OAuth return (YouTube/Instagram) without rendering Dashboard or SubscriptionProvider. */
function OAuthCallbackScreen() {
  const processedRef = useRef(false);
  useEffect(() => {
    if (processedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    const isInstagram = state.startsWith('instagram_');
    const storageKey = isInstagram ? 'instagram_oauth' : 'youtube_oauth';

    const waitForSession = async (): Promise<boolean> => {
      for (let i = 0; i < 10; i++) {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token && i > 0) {
          const { data: { session: ref } } = await supabase.auth.refreshSession();
          session = ref;
        }
        if (session?.access_token) return true;
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    };

    (async () => {
      const hasSession = await waitForSession();
      if (processedRef.current) return;
      if (!hasSession) {
        localStorage.setItem(`${storageKey}_code`, code);
        localStorage.setItem(`${storageKey}_state`, state);
        window.history.replaceState({}, '', '/');
        alert('Please sign in first, then open Linked accounts to complete the connection.');
        return;
      }
      processedRef.current = true;

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const fn = isInstagram ? 'instagram-oauth' : 'youtube-oauth';
      const url = `${baseUrl}/functions/v1/${fn}?action=callback&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
        });
        const text = await res.text();
        const data = (() => { try { return JSON.parse(text); } catch { return {}; } })();

        if (res.ok && data.success) {
          localStorage.removeItem(`${storageKey}_code`);
          localStorage.removeItem(`${storageKey}_state`);
          window.history.replaceState({}, '', '/?view=accounts');
          window.location.reload();
        } else {
          localStorage.setItem(`${storageKey}_code`, code);
          localStorage.setItem(`${storageKey}_state`, state);
          window.history.replaceState({}, '', '/');
          alert('Connection failed: ' + (data.error || data.message || res.statusText));
        }
      } catch (err) {
        console.error('OAuth callback error:', err);
        localStorage.setItem(`${storageKey}_code`, code);
        localStorage.setItem(`${storageKey}_state`, state);
        window.history.replaceState({}, '', '/');
        alert('Connection failed. Please try again.');
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      <p className="text-slate-300">Completing connection…</p>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const [oauthInUrl] = useState(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    return !!(p.get('code') && p.get('state'));
  });

  useEffect(() => {
    if (oauthInUrl) return;
    const storedYtCode = localStorage.getItem('youtube_oauth_code');
    const storedYtState = localStorage.getItem('youtube_oauth_state');
    const storedIgCode = localStorage.getItem('instagram_oauth_code');
    const storedIgState = localStorage.getItem('instagram_oauth_state');
    if (!storedYtCode && !storedIgCode) return;
    if (!user || loading) return;

    const run = async () => {
      await new Promise(r => setTimeout(r, 800));
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: { session: ref } } = await supabase.auth.refreshSession();
        session = ref;
      }
      if (!session?.access_token) return;
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (storedIgCode && storedIgState) {
        const url = `${baseUrl}/functions/v1/instagram-oauth?action=callback&code=${encodeURIComponent(storedIgCode)}&state=${encodeURIComponent(storedIgState)}`;
        const res = await fetch(url, { method: 'GET', headers: { apikey: anonKey, 'Content-Type': 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          localStorage.removeItem('instagram_oauth_code');
          localStorage.removeItem('instagram_oauth_state');
          window.history.replaceState({}, '', '/?view=accounts');
          window.location.reload();
        }
      } else if (storedYtCode && storedYtState) {
        const url = `${baseUrl}/functions/v1/youtube-oauth?action=callback&code=${encodeURIComponent(storedYtCode)}&state=${encodeURIComponent(storedYtState)}`;
        const res = await fetch(url, { method: 'GET', headers: { apikey: anonKey, 'Content-Type': 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          localStorage.removeItem('youtube_oauth_code');
          localStorage.removeItem('youtube_oauth_state');
          window.history.replaceState({}, '', '/?view=accounts');
          window.location.reload();
        }
      }
    };
    run();
  }, [oauthInUrl, user, loading]);

  if (oauthInUrl) {
    return <OAuthCallbackScreen />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <SubscriptionProvider>
      {user ? (
        <Dashboard />
      ) : showAuth ? (
        <Auth />
      ) : (
        <LandingPage onGetStarted={() => setShowAuth(true)} />
      )}
    </SubscriptionProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
