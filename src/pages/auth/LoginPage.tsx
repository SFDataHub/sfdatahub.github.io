import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ContentShell from "../../components/ContentShell";
import LoginCard from "../../components/auth/LoginCard";
import { useAuth } from "../../context/AuthContext";

const AUTH_NEXT_STORAGE_KEY = "sfh:authNext";

const isSafeNextPath = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.toLowerCase().startsWith("/login")) return null;
  return trimmed;
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user } = useAuth();

  const isAuthenticated = status === "authenticated" && !!user;

  const nextFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next");
  }, [location.search]);

  const storedNext = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY);
    } catch (error) {
      console.warn("[Login] Failed to read auth next from sessionStorage", error);
      return null;
    }
  }, []);

  const resolvedNext = React.useMemo(
    () => isSafeNextPath(nextFromQuery) ?? isSafeNextPath(storedNext),
    [nextFromQuery, storedNext],
  );

  React.useEffect(() => {
    if (!isAuthenticated) return;

    const nextPath = resolvedNext;
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
    }
    if (nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [isAuthenticated, navigate, resolvedNext]);

  return (
    <ContentShell title="Account Access" subtitle="Connect with your community identity" mode="page" padded>
      <LoginCard />
    </ContentShell>
  );
};

export default LoginPage;
