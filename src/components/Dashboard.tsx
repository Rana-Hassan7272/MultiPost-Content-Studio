import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { DashboardNavContext, type DashboardView } from '../contexts/DashboardNavContext';
import {
  LayoutDashboard,
  CalendarDays,
  ImagePlus,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Link2,
  BarChart3,
  Clock,
  Users,
  TrendingUp,
  Crown,
  Sparkles,
  CreditCard,
  Mail
} from 'lucide-react';
import { Pricing } from './Pricing';
import { createCheckoutSession } from '../services/subscriptionService';
import { Overview } from './dashboard/Overview';
import { Calendar } from './dashboard/Calendar';
import { MediaLibrary } from './dashboard/MediaLibrary';
import { PostComposer } from './dashboard/PostComposer';
import { ConnectedAccounts } from './dashboard/ConnectedAccounts';
import { Analytics } from './dashboard/Analytics';
import { VoiceProfileSettings } from './dashboard/VoiceProfileSettings';
import { SmartScheduling } from './dashboard/SmartScheduling';
import { AudienceInsights } from './dashboard/AudienceInsights';
import { PostPerformance } from './dashboard/PostPerformance';
import { PredictionDashboard } from './dashboard/PredictionDashboard';
import { EmailMarketing } from './dashboard/EmailMarketing';

type View = DashboardView;

export function Dashboard() {
  const { signOut, user } = useAuth();
  const { plan, refetch } = useSubscription();
  const [currentView, setCurrentView] = useState<View>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const [showFakeCheckout, setShowFakeCheckout] = useState(false);
  const [selectedPlanForFake, setSelectedPlanForFake] = useState<'starter' | 'pro' | null>(null);
  const [fakeCheckoutLoading, setFakeCheckoutLoading] = useState(false);
  const [fakeCheckoutError, setFakeCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view') as View;
    if (view && ['overview', 'calendar', 'media', 'compose', 'email', 'accounts', 'analytics', 'voice-profile', 'smart-scheduling', 'audience', 'performance', 'predictions', 'pricing'].includes(view)) {
      setCurrentView(view);
    }
    const sub = urlParams.get('subscription');
    const planParam = urlParams.get('plan');
    if (sub === 'activated' && planParam) {
      refetch();
      setSubscriptionMessage(`You're now on ${planParam.charAt(0).toUpperCase() + planParam.slice(1)}!`);
      setTimeout(() => setSubscriptionMessage(null), 5000);
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, [refetch]);

  const navigation = [
    { id: 'overview', name: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'compose', name: 'Créer', icon: FileText },
    { id: 'email', name: 'Email marketing', icon: Mail },
    { id: 'calendar', name: 'Calendrier', icon: CalendarDays },
    { id: 'media', name: 'Médias', icon: ImagePlus },
    { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    { id: 'performance', name: 'Performance', icon: TrendingUp },
    { id: 'predictions', name: 'Predictions', icon: TrendingUp },
    { id: 'smart-scheduling', name: 'Smart Scheduling', icon: Clock },
    { id: 'audience', name: 'Audience', icon: Users },
    { id: 'accounts', name: 'Comptes liés', icon: Link2 },
    { id: 'voice-profile', name: 'Profil de voix', icon: Settings },
    ...(plan !== 'pro' ? [{ id: 'pricing' as const, name: 'Upgrade plan', icon: Sparkles }] : []),
  ];

  const handleSelectPlan = async (planType: string) => {
    if (planType === 'free') return;
    const paymentMode = import.meta.env.VITE_PAYMENT_MODE || 'fake';
    if (paymentMode === 'fake') {
      setSelectedPlanForFake(planType as 'starter' | 'pro');
      setShowFakeCheckout(true);
      return;
    }
    try {
      const result = await createCheckoutSession(planType as 'starter' | 'pro');
      if (result.error) {
        alert(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    } catch (e) {
      alert('Something went wrong. Please try again.');
    }
  };

  const handleFakePaymentSubmit = async () => {
    if (!selectedPlanForFake) return;
    setFakeCheckoutLoading(true);
    setFakeCheckoutError(null);
    try {
      const result = await createCheckoutSession(selectedPlanForFake);
      if (result.error) {
        setFakeCheckoutError(result.error);
        return;
      }
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (e) {
      setFakeCheckoutError('Something went wrong. Please try again.');
    } finally {
      setFakeCheckoutLoading(false);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'overview':
        return <Overview />;
      case 'calendar':
        return <Calendar />;
      case 'media':
        return <MediaLibrary />;
      case 'compose':
        return <PostComposer />;
      case 'accounts':
        return <ConnectedAccounts />;
      case 'email':
        return <EmailMarketing />;
      case 'analytics':
        return <Analytics />;
      case 'voice-profile':
        return <VoiceProfileSettings />;
      case 'smart-scheduling':
        return <SmartScheduling />;
      case 'audience':
        return <AudienceInsights />;
      case 'performance':
        return <PostPerformance />;
      case 'predictions':
        return <PredictionDashboard />;
      case 'pricing':
        return (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Upgrade your plan</h1>
              <p className="text-slate-600 mt-2">Get more posts, accounts, and features. Choose the plan that fits you.</p>
            </div>
            <Pricing onSelectPlan={handleSelectPlan} currentPlan={plan} />
          </div>
        );
      default:
        return <Overview />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardNavContext.Provider value={(view) => setCurrentView(view)}>

      {showFakeCheckout && selectedPlanForFake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowFakeCheckout(false); setSelectedPlanForFake(null); setFakeCheckoutError(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Test payment</h3>
              <button type="button" onClick={() => { setShowFakeCheckout(false); setSelectedPlanForFake(null); setFakeCheckoutError(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-600 mb-4">
              Enter a test card number to activate <span className="font-semibold text-slate-900">{selectedPlanForFake === 'starter' ? 'Starter' : 'Pro'}</span>. No real charge.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Card number</label>
                <input
                  type="text"
                  placeholder="4242 4242 4242 4242"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={19}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Expiry (MM/YY)</label>
                  <input type="text" placeholder="12/34" className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500" maxLength={5} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">CVC</label>
                  <input type="text" placeholder="123" className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500" maxLength={4} />
                </div>
              </div>
            </div>
            {fakeCheckoutError && <p className="text-red-600 text-sm mt-3">{fakeCheckoutError}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => { setShowFakeCheckout(false); setSelectedPlanForFake(null); setFakeCheckoutError(null); }}
                className="flex-1 py-3 px-4 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFakePaymentSubmit}
                disabled={fakeCheckoutLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                {fakeCheckoutLoading ? 'Activating…' : 'Activate plan'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-4 text-center">Use any test card (e.g. 4242 4242 4242 4242). Your plan will be activated immediately.</p>
          </div>
        </div>
      )}

      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          ContentFlow
        </h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <div className="flex pt-16 lg:pt-0">
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-slate-200 transition-transform duration-300 z-40 flex flex-col`}
        >
          <div className="p-6 border-b border-slate-200 hidden lg:block">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              ContentFlow
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isUpgrade = item.id === 'pricing';
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as View);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    isUpgrade
                      ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-800 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-200'
                      : isActive
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isUpgrade ? 'text-amber-600' : ''}`} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200 space-y-2">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-semibold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
                <p className="text-xs text-slate-500 capitalize flex items-center gap-1">
                  {plan === 'pro' && <Crown className="w-3 h-3" />}
                  {plan} plan
                </p>
              </div>
            </div>
            {plan !== 'pro' && (
              <button
                type="button"
                onClick={() => { setCurrentView('pricing'); setSidebarOpen(false); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-lg hover:from-amber-600 hover:to-orange-600 transition shadow-md"
              >
                <Sparkles className="w-4 h-4" />
                Upgrade plan
              </button>
            )}
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-y-auto">
          {subscriptionMessage && (
            <div className="bg-green-100 border-b border-green-200 text-green-800 px-4 py-2 text-center text-sm font-medium">
              {subscriptionMessage}
            </div>
          )}
          <div className="max-w-7xl mx-auto p-6 lg:p-8">
            {renderView()}
          </div>
        </main>
      </div>
    </DashboardNavContext.Provider>
    </div>
  );
}
