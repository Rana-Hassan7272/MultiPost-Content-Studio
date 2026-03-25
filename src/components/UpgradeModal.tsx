import { useState } from 'react';
import { X, Crown, Zap } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { createCheckoutSession } from '../services/subscriptionService';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export function UpgradeModal({ open, onClose, title = 'Upgrade your plan', message }: UpgradeModalProps) {
  const { plan } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubscribe = async (planType: 'starter' | 'pro') => {
    setLoading(true);
    setError(null);
    try {
      const result = await createCheckoutSession(planType);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        {message && <p className="text-slate-600 mb-6">{message}</p>}
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="space-y-3">
          {plan === 'free' && (
            <>
              <button
                onClick={() => handleSubscribe('starter')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                <Zap className="w-5 h-5" />
                Starter — $10/month
              </button>
              <button
                onClick={() => handleSubscribe('pro')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                <Crown className="w-5 h-5" />
                Pro — $24/month
              </button>
            </>
          )}
          {plan === 'starter' && (
            <button
              onClick={() => handleSubscribe('pro')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              <Crown className="w-5 h-5" />
              Pro — $24/month
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-4 text-center">
          Test mode: subscription activates without payment. Set PAYMENT_MODE=stripe_test for Stripe test cards.
        </p>
      </div>
    </div>
  );
}
