import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Youtube, Instagram, Video } from 'lucide-react';

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-8 items-center">
        <div className="text-white space-y-6">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              ContentFlow
            </h1>
            <p className="text-xl text-slate-300">
              Gérez et publiez votre contenu sur toutes vos plateformes sociales en un seul endroit
            </p>
          </div>

          <div className="space-y-4 pt-8">
            <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg backdrop-blur">
              <div className="p-3 bg-red-500/10 rounded-lg">
                <Youtube className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold">YouTube</h3>
                <p className="text-sm text-slate-400">Planifiez vos vidéos et shorts</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg backdrop-blur">
              <div className="p-3 bg-pink-500/10 rounded-lg">
                <Instagram className="w-6 h-6 text-pink-500" />
              </div>
              <div>
                <h3 className="font-semibold">Instagram</h3>
                <p className="text-sm text-slate-400">Posts, Reels et Stories</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg backdrop-blur">
              <div className="p-3 bg-cyan-500/10 rounded-lg">
                <Video className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <h3 className="font-semibold">TikTok</h3>
                <p className="text-sm text-slate-400">Gérez vos vidéos courtes</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                {isLogin ? 'Connexion' : 'Créer un compte'}
              </h2>
              <p className="text-slate-600 mt-2">
                {isLogin ? 'Bienvenue ! Connectez-vous à votre compte' : 'Commencez à gérer votre contenu'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-2">
                    Nom complet
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="John Doe"
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="vous@exemple.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-cyan-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Chargement...' : isLogin ? 'Se connecter' : 'Créer mon compte'}
              </button>
            </form>

            <div className="text-center">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-blue-500 hover:text-blue-600 font-medium transition"
              >
                {isLogin ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
