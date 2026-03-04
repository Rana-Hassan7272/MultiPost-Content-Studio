import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { LandingPage } from './components/LandingPage';
import { supabase } from './lib/supabase';

function AppContent() {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    const processCallback = async () => {
      if (code && state) {
        const isInstagram = state.startsWith('instagram_');
        const storageKey = isInstagram ? 'instagram_oauth' : 'youtube_oauth';
        if (user) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: { session } } = await supabase.auth.getSession();
          if (session && session.access_token) {
            if (isInstagram) {
              await handleInstagramCallback(code, state);
            } else {
              await handleYoutubeCallback(code, state);
            }
          } else {
            localStorage.setItem(`${storageKey}_code`, code);
            localStorage.setItem(`${storageKey}_state`, state);
            window.history.replaceState({}, '', '/');
            alert('Session expired. Please sign in again. After signing in, the connection will complete automatically.');
          }
        } else if (!loading) {
          localStorage.setItem(`${storageKey}_code`, code);
          localStorage.setItem(`${storageKey}_state`, state);
          window.history.replaceState({}, '', '/');
        }
      } else if (user && !loading) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const storedYtCode = localStorage.getItem('youtube_oauth_code');
        const storedYtState = localStorage.getItem('youtube_oauth_state');
        const storedIgCode = localStorage.getItem('instagram_oauth_code');
        const storedIgState = localStorage.getItem('instagram_oauth_state');
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.access_token) {
          if (storedIgCode && storedIgState) {
            await handleInstagramCallback(storedIgCode, storedIgState);
          } else if (storedYtCode && storedYtState) {
            await handleYoutubeCallback(storedYtCode, storedYtState);
          }
        } else if (storedYtCode && storedYtState) {
          setTimeout(async () => {
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession?.access_token) await handleYoutubeCallback(storedYtCode, storedYtState);
          }, 2000);
        } else if (storedIgCode && storedIgState) {
          setTimeout(async () => {
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession?.access_token) await handleInstagramCallback(storedIgCode, storedIgState);
          }, 2000);
        }
      }
    };
    
    if (!loading) {
      processCallback();
    }
  }, [user, loading]);

  const handleInstagramCallback = async (code: string, state: string) => {
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth?action=callback&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
      const response = await fetch(functionUrl, {
        method: 'GET',
        headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        localStorage.removeItem('instagram_oauth_code');
        localStorage.removeItem('instagram_oauth_state');
        window.history.replaceState({}, '', '/?view=accounts');
        setTimeout(() => window.location.reload(), 500);
      } else {
        localStorage.removeItem('instagram_oauth_code');
        localStorage.removeItem('instagram_oauth_state');
        window.history.replaceState({}, '', '/');
        alert('Failed to connect Instagram: ' + (data.error || data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Instagram callback error:', error);
      localStorage.removeItem('instagram_oauth_code');
      localStorage.removeItem('instagram_oauth_state');
      window.history.replaceState({}, '', '/');
      alert('Failed to connect Instagram. Please try again.');
    }
  };

  const handleYoutubeCallback = async (code: string, state: string) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (!session) {
        const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
        if (refreshedSession) {
          session = refreshedSession;
        }
      }
      
      if (!session) {
        localStorage.setItem('youtube_oauth_code', code);
        localStorage.setItem('youtube_oauth_state', state);
        window.history.replaceState({}, '', '/');
        alert('Please sign in to complete YouTube connection.');
        return;
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-oauth?action=callback&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

      const response = await fetch(functionUrl, {
        method: 'GET',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse response:', responseText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      if (response.ok && data.success) {
        localStorage.removeItem('youtube_oauth_code');
        localStorage.removeItem('youtube_oauth_state');
        window.history.replaceState({}, '', '/?view=accounts');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        localStorage.setItem('youtube_oauth_code', code);
        localStorage.setItem('youtube_oauth_state', state);
        window.history.replaceState({}, '', '/');
        alert('Failed to connect YouTube account: ' + (data.error || data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('YouTube callback error:', error);
      localStorage.setItem('youtube_oauth_code', code);
      localStorage.setItem('youtube_oauth_state', state);
      alert('Failed to connect YouTube account. Please try again.');
      window.history.replaceState({}, '', '/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (user) return <Dashboard />;
  if (showAuth) return <Auth />;
  return <LandingPage onGetStarted={() => setShowAuth(true)} />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
