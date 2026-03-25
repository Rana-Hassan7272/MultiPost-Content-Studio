import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getEffectivePlan, getUsage, type Usage } from '../services/subscriptionService';
import { getPlanLimits, type PlanType } from '../lib/planLimits';

interface SubscriptionContextType {
  plan: PlanType;
  usage: Usage | null;
  limits: ReturnType<typeof getPlanLimits>;
  loading: boolean;
  refetch: () => Promise<void>;
  canUseFeature: (feature: keyof ReturnType<typeof getPlanLimits>['features']) => boolean;
  isAtLimit: (kind: 'posts' | 'ai' | 'accounts' | 'storage' | 'mediaItems' | 'voiceProfiles') => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

const defaultLimits = getPlanLimits('free');
const defaultContextValue: SubscriptionContextType = {
  plan: 'free',
  usage: null,
  limits: defaultLimits,
  loading: false,
  refetch: async () => {},
  canUseFeature: () => false,
  isAtLimit: () => false,
};

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanType>('free');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setPlan('free');
      setUsage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [planResult, usageResult] = await Promise.all([
        getEffectivePlan(user.id),
        getUsage(user.id),
      ]);
      setPlan(planResult);
      setUsage(usageResult);
    } catch {
      setPlan('free');
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const limits = getPlanLimits(plan);

  const canUseFeature = useCallback(
    (feature: keyof ReturnType<typeof getPlanLimits>['features']) => limits.features[feature] ?? false,
    [limits]
  );

  const isAtLimit = useCallback(
    (kind: 'posts' | 'ai' | 'accounts' | 'storage' | 'mediaItems' | 'voiceProfiles') => {
      if (!usage) return false;
      switch (kind) {
        case 'posts':
          return usage.postsThisMonth >= limits.postsPerMonth;
        case 'ai':
          return usage.aiGenerationsThisMonth >= limits.aiGenerationsPerMonth;
        case 'accounts':
          return usage.connectedAccountsCount >= limits.connectedAccounts;
        case 'storage':
          return usage.storageUsedBytes >= limits.storageBytes;
        case 'mediaItems':
          return usage.mediaLibraryCount >= limits.mediaLibraryItems;
        case 'voiceProfiles':
          return usage.voiceProfilesCount >= limits.voiceProfiles;
        default:
          return false;
      }
    },
    [usage, limits]
  );

  return (
    <SubscriptionContext.Provider
      value={{
        plan,
        usage,
        limits,
        loading,
        refetch,
        canUseFeature,
        isAtLimit,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  return context ?? defaultContextValue;
}
