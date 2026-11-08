import React from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import LoginModal from "./LoginModal";

const OPEN_LOGIN_MODAL_EVENT = "sfh:openLoginModal";

const LoginModalHost: React.FC = () => {
  const { status, user } = useAuth();
  const location = useLocation();
  // Bind the request to this router location, including POP navigation.
  const [loginLocation, setLoginLocation] = React.useState<typeof location | null>(null);
  const isOpen = loginLocation === location && location.pathname !== "/login";

  React.useLayoutEffect(() => {
    const handler = () => setLoginLocation(location);
    window.addEventListener(OPEN_LOGIN_MODAL_EVENT, handler);
    return () => window.removeEventListener(OPEN_LOGIN_MODAL_EVENT, handler);
  }, [location]);

  React.useEffect(() => {
    if (!isOpen) return;
    const isAuthenticated = status === "authenticated" && !!user;
    if (isAuthenticated) {
      setLoginLocation(null);
    }
  }, [isOpen, status, user]);

  return <LoginModal isOpen={isOpen} onClose={() => setLoginLocation(null)} />;
};

export default LoginModalHost;

