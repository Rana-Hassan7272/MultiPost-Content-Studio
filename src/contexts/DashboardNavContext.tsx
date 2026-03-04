import { createContext, useContext } from 'react';

export type DashboardView =
  | 'overview'
  | 'calendar'
  | 'media'
  | 'compose'
  | 'accounts'
  | 'analytics'
  | 'voice-profile'
  | 'smart-scheduling'
  | 'audience'
  | 'performance'
  | 'predictions';

type DashboardNavFn = (view: DashboardView) => void;

export const DashboardNavContext = createContext<DashboardNavFn | null>(null);

export function useDashboardNav(): DashboardNavFn {
  const nav = useContext(DashboardNavContext);
  if (!nav) {
    return () => {};
  }
  return nav;
}
