import { Check } from 'lucide-react';

interface PricingPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  planType: 'free' | 'starter' | 'pro';
}

interface PricingProps {
  onSelectPlan: (planType: string) => void;
}

export function Pricing({ onSelectPlan }: PricingProps) {
  const plans: PricingPlan[] = [
    {
      name: 'Gratuit',
      price: '0',
      period: 'mois',
      description: 'Pour tester la plateforme',
      planType: 'free',
      cta: 'Commencer gratuitement',
      features: [
        '5 posts par mois',
        '1 plateforme connectée',
        '500 MB de stockage',
        'Support par email',
      ],
    },
    {
      name: 'Starter',
      price: '29',
      period: 'mois',
      description: 'Pour créateurs individuels',
      planType: 'starter',
      cta: 'Commencer maintenant',
      highlighted: true,
      features: [
        '50 posts par mois',
        '2 plateformes connectées',
        '10 GB de stockage',
        'Analytics de base',
        'Planification avancée',
        'Support prioritaire',
      ],
    },
    {
      name: 'Pro',
      price: '79',
      period: 'mois',
      description: 'Pour équipes et agences',
      planType: 'pro',
      cta: 'Passer au Pro',
      features: [
        'Posts illimités',
        'Toutes les plateformes',
        '100 GB de stockage',
        'Analytics avancés',
        'Gestion d\'équipe',
        'API access',
        'Support 24/7',
        'Rapports personnalisés',
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
      {plans.map((plan) => (
        <div
          key={plan.name}
          className={`bg-white rounded-2xl p-8 ${
            plan.highlighted
              ? 'ring-2 ring-blue-500 shadow-xl scale-105'
              : 'border border-slate-200 shadow-sm'
          }`}
        >
          {plan.highlighted && (
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold px-4 py-1 rounded-full inline-block mb-4">
              Le plus populaire
            </div>
          )}

          <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
          <p className="text-slate-600 mb-6">{plan.description}</p>

          <div className="mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-slate-900">{plan.price}</span>
              <span className="text-slate-600">/ {plan.period}</span>
            </div>
          </div>

          <button
            onClick={() => onSelectPlan(plan.planType)}
            className={`w-full py-3 px-6 rounded-lg font-semibold transition mb-8 ${
              plan.highlighted
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-lg'
                : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
            }`}
          >
            {plan.cta}
          </button>

          <ul className="space-y-4">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
