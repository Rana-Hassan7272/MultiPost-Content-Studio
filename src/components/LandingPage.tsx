import { useState } from 'react';
import { Calendar, Image, BarChart, Zap, Shield, Users } from 'lucide-react';
import { Pricing } from './Pricing';
import { supabase } from '../lib/supabase';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const [email, setEmail] = useState('');

  const handleSelectPlan = async (planType: string) => {
    if (planType === 'free') {
      onGetStarted();
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onGetStarted();
      return;
    }

    try {
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

      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Erreur lors de la création de la session de paiement');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            ContentFlow
          </h1>
          <button
            onClick={onGetStarted}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:shadow-lg transition"
          >
            Connexion
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-5xl lg:text-6xl font-bold text-slate-900 mb-6">
              Gérez tous vos réseaux sociaux en un seul endroit
            </h2>
            <p className="text-xl text-slate-600 mb-8">
              Publiez, planifiez et analysez vos contenus sur YouTube, Instagram et TikTok. Gagnez du temps et augmentez votre impact.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onGetStarted}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-semibold text-lg hover:shadow-xl transition"
              >
                Essayer gratuitement
              </button>
              <a
                href="#pricing"
                className="px-8 py-4 bg-white border-2 border-slate-300 text-slate-900 rounded-lg font-semibold text-lg hover:border-blue-500 transition"
              >
                Voir les tarifs
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-center text-slate-900 mb-16">
            Tout ce dont vous avez besoin pour réussir
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Calendar,
                title: 'Planification intelligente',
                description: 'Planifiez vos publications à l\'avance avec notre calendrier intuitif.',
              },
              {
                icon: Image,
                title: 'Bibliothèque média',
                description: 'Stockez et organisez tous vos médias en un seul endroit.',
              },
              {
                icon: BarChart,
                title: 'Analytics détaillés',
                description: 'Suivez vos performances avec des statistiques précises.',
              },
              {
                icon: Zap,
                title: 'Publication rapide',
                description: 'Publiez sur plusieurs plateformes en un seul clic.',
              },
              {
                icon: Shield,
                title: 'Sécurisé',
                description: 'Vos données sont protégées avec un chiffrement de niveau entreprise.',
              },
              {
                icon: Users,
                title: 'Collaboration',
                description: 'Travaillez en équipe avec des rôles et permissions.',
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="bg-slate-50 rounded-xl p-6 hover:shadow-lg transition">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-xl font-semibold text-slate-900 mb-2">{feature.title}</h4>
                  <p className="text-slate-600">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-bold text-slate-900 mb-4">
              Choisissez votre plan
            </h3>
            <p className="text-xl text-slate-600">
              Commencez gratuitement, évoluez selon vos besoins
            </p>
          </div>
          <Pricing onSelectPlan={handleSelectPlan} />
        </div>
      </section>

      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h4 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-4">
                ContentFlow
              </h4>
              <p className="text-slate-600">
                La solution complète pour gérer vos réseaux sociaux
              </p>
            </div>
            <div>
              <h5 className="font-semibold text-slate-900 mb-4">Produit</h5>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-blue-600">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-blue-600">Tarifs</a></li>
                <li><a href="#" className="hover:text-blue-600">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold text-slate-900 mb-4">Entreprise</h5>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-blue-600">À propos</a></li>
                <li><a href="#" className="hover:text-blue-600">Blog</a></li>
                <li><a href="#" className="hover:text-blue-600">Contact</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold text-slate-900 mb-4">Légal</h5>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-blue-600">Confidentialité</a></li>
                <li><a href="#" className="hover:text-blue-600">CGU</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-200 mt-12 pt-8 text-center text-slate-600">
            <p>&copy; 2024 ContentFlow. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
