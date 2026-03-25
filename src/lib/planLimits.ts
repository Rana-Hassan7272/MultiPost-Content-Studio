/**
 * Single source of truth for plan limits and features.
 * Used by frontend and backend (keep in sync with edge functions / triggers).
 */
export type PlanType = 'free' | 'starter' | 'pro';

export interface PlanLimits {
  connectedAccounts: number;
  postsPerMonth: number;
  storageBytes: number;
  mediaLibraryItems: number;
  aiGenerationsPerMonth: number;
  voiceProfiles: number;
  features: {
    recurringSchedules: boolean;
    captionTemplates: boolean;
    performancePrediction: boolean;
    smartScheduling: boolean;
    analyticsExportCsv: boolean;
    fullAnalytics: boolean;
    audienceInsights: boolean;
  };
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    connectedAccounts: 1,
    postsPerMonth: 10,
    storageBytes: 500 * 1024 * 1024, // 500 MB
    mediaLibraryItems: 20,
    aiGenerationsPerMonth: 20,
    voiceProfiles: 1,
    features: {
      recurringSchedules: false,
      captionTemplates: false,
      performancePrediction: false,
      smartScheduling: false,
      analyticsExportCsv: false,
      fullAnalytics: true,
      audienceInsights: false,
    },
  },
  starter: {
    connectedAccounts: 2,
    postsPerMonth: 50,
    storageBytes: 2 * 1024 * 1024 * 1024, // 2 GB
    mediaLibraryItems: 500,
    aiGenerationsPerMonth: 200,
    voiceProfiles: 2,
    features: {
      recurringSchedules: true,
      captionTemplates: true,
      performancePrediction: true,
      smartScheduling: false,
      analyticsExportCsv: false,
      fullAnalytics: true,
      audienceInsights: false,
    },
  },
  pro: {
    connectedAccounts: 5,
    postsPerMonth: 500,
    storageBytes: 15 * 1024 * 1024 * 1024, // 15 GB
    mediaLibraryItems: 2000,
    aiGenerationsPerMonth: 1000,
    voiceProfiles: 5,
    features: {
      recurringSchedules: true,
      captionTemplates: true,
      performancePrediction: true,
      smartScheduling: true,
      analyticsExportCsv: true,
      fullAnalytics: true,
      audienceInsights: true,
    },
  },
};

export function getPlanLimits(planType: PlanType): PlanLimits {
  return PLAN_LIMITS[planType] ?? PLAN_LIMITS.free;
}

export function isFeatureAllowed(planType: PlanType, feature: keyof PlanLimits['features']): boolean {
  return getPlanLimits(planType).features[feature] ?? false;
}
