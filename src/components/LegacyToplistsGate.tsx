import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useLegacyToplistsAccess } from "../lib/toplists/legacyAccess";

export default function LegacyToplistsGate({ children }: { children: ReactNode }) {
  const { loading, canAccess } = useLegacyToplistsAccess();
  if (loading) return null;
  if (!canAccess) return <Navigate to="/data-hub/toplist" replace />;
  return <>{children}</>;
}
