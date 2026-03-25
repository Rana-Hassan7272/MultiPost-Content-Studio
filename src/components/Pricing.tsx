import { Check } from 'lucide-react';
import { PLAN_LIMITS, type PlanType } from '../lib/planLimits';

interface PricingPlan {
  name: string;
  planType: PlanType;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

interface PricingProps {
  onSelectPlan: (planType: string) => void;
  isLoggedIn?: boolean;
  /** When set, show "Your plan" on this card and adjust CTAs */
  currentPlan?: PlanType;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${bytes / (1024 * 1024 * 1024)} GB`;
  if (bytes >= 1024 * 1024) return `${bytes / (1024 * 1024)} MB`;
  return `${bytes / 1024} KB`;
}

export function Pricing({ onSelectPlan, currentPlan }: PricingProps) {
  const plans: PricingPlan[] = [
    {
      name: 'Free',
      planType: 'free',
      price: '0',
      period: 'month',
      description: 'Try the platform',
      cta: 'Get started free',
      features: [
        `${PLAN_LIMITS.free.postsPerMonth} posts per month`,
        `${PLAN_LIMITS.free.connectedAccounts} connected account`,
        `${formatBytes(PLAN_LIMITS.free.storageBytes)} storage`,
        `${PLAN_LIMITS.free.mediaLibraryItems} media library items`,
        `${PLAN_LIMITS.free.aiGenerationsPerMonth} AI generations/month`,
        `${PLAN_LIMITS.free.voiceProfiles} voice profile`,
        'Basic scheduling (once)',
        'Calendar view',
        'Basic analytics',
      ],
    },
    {
      name: 'Starter',
      planType: 'starter',
      price: '10',
      period: 'month',
      description: 'For solo creators',
      cta: 'Subscribe',
      highlighted: true,
      features: [
        `${PLAN_LIMITS.starter.postsPerMonth} posts per month`,
        `${PLAN_LIMITS.starter.connectedAccounts} connected accounts`,
        `${formatBytes(PLAN_LIMITS.starter.storageBytes)} storage`,
        `${PLAN_LIMITS.starter.aiGenerationsPerMonth} AI generations/month`,
        `Up to ${PLAN_LIMITS.starter.voiceProfiles} voice profiles`,
        'Recurring schedules',
        'Caption templates',
        'Performance prediction',
      ],
    },
    {
      name: 'Pro',
      planType: 'pro',
      price: '24',
      period: 'month',
      description: 'For serious creators & small teams',
      cta: 'Subscribe',
      features: [
        '500 posts per month (fair use)',
        `${PLAN_LIMITS.pro.connectedAccounts} connected accounts`,
        `${formatBytes(PLAN_LIMITS.pro.storageBytes)} storage`,
        `${PLAN_LIMITS.pro.aiGenerationsPerMonth} AI generations/month`,
        `Up to ${PLAN_LIMITS.pro.voiceProfiles} voice profiles`,
        'Everything in Starter',
        'Smart scheduling',
        'Full analytics & CSV export',
        'Audience insights',
        'Priority support',
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
      {plans.map((plan) => {
        const isCurrent = currentPlan === plan.planType;
        return (
        <div
          key={plan.name}
          className={`bg-white rounded-2xl p-8 relative ${
            plan.highlighted
              ? 'ring-2 ring-blue-500 shadow-xl md:scale-105 z-10'
              : 'border border-slate-200 shadow-sm'
          } ${isCurrent ? 'ring-2 ring-green-400 ring-offset-2' : ''}`}
        >
          {isCurrent && (
            <div className="absolute top-4 right-4 bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
              Your plan
            </div>
          )}
          {plan.highlighted && !isCurrent && (
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold px-4 py-1 rounded-full inline-block mb-4">
              Most popular
            </div>
          )}

          <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
          <p className="text-slate-600 mb-6">{plan.description}</p>

          <div className="mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-slate-900">${plan.price}</span>
              <span className="text-slate-600">/ {plan.period}</span>
            </div>
          </div>

          {plan.planType === 'free' ? (
            <button
              onClick={() => onSelectPlan(plan.planType)}
              className="w-full py-3 px-6 rounded-lg font-semibold transition mb-8 bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              {plan.cta}
            </button>
          ) : (
            <button
              onClick={() => !isCurrent && onSelectPlan(plan.planType)}
              disabled={isCurrent}
              className={`w-full py-3 px-6 rounded-lg font-semibold transition mb-8 ${
                isCurrent
                  ? 'bg-slate-100 text-slate-500 cursor-default'
                  : plan.highlighted
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg'
                    : 'bg-slate-800 text-white hover:bg-slate-700'
              }`}
            >
              {isCurrent ? 'Current plan' : plan.cta}
            </button>
          )}

          <ul className="space-y-4">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      );
      })}
    </div>
  );
}
