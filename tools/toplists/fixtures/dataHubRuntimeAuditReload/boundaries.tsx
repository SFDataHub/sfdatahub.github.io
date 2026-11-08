import React from "react";
export const AuthProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const auth = { user: null, status: "unauthenticated", isLoading: false, error: null,
  logout: async () => {}, login: async () => {}, refreshSession: async () => {} };
export const useAuth = () => auth;
export const useGuildHubSelection = () => ({ activeGuild: null, activeGuildId: null, isLoading: false });
