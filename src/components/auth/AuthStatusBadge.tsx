import React from "react";

import { useAuth } from "../../context/AuthContext";

const AuthStatusBadge: React.FC = () => {
  const { status, user, loginWithDiscord, loginWithGoogle, logout } = useAuth();

  if (status === "loading" || status === "idle") {
    return <span style={{ color: "var(--text-muted)" }}>Checking session…</span>;
  }

  if (status === "unauthenticated") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={loginWithDiscord}>
          Login with Discord
        </button>
        <button type="button" onClick={loginWithGoogle}>
          Login with Google
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>
        Signed in as <strong>{user?.displayName ?? "Unknown"}</strong>
        {user?.provider ? ` (${user.provider})` : ""}
      </span>
      <button type="button" onClick={logout}>
        Logout
      </button>
    </div>
  );
};

export default AuthStatusBadge;
