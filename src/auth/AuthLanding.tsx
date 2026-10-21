import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { liveMode } from './client';
import { callbackLocation } from './callbackLocation';

export function AuthLanding({ children }: { children: ReactNode }) {
  const location = useLocation();
  const target = liveMode ? callbackLocation(location) : undefined;
  // URL values select the screen only. Supabase still verifies the token/session.
  return target ? <Navigate to={target} replace /> : children;
}
