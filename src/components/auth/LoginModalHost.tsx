import React from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import LoginModal from "./LoginModal";

const OPEN_LOGIN_MODAL_EVENT = "sfh:openLoginModal";

const LoginModalHost: React.FC = () => {
  const { status, user } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener(OPEN_LOGIN_MODAL_EVENT, handler as EventListener);
    return () => window.removeEventListener(OPEN_LOGIN_MODAL_EVENT, handler as EventListener);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    if (location.pathname === "/login") {
      setIsOpen(false);
    }
  }, [isOpen, location.pathname]);

  React.useEffect(() => {
    if (!isOpen) return;
    const isAuthenticated = status === "authenticated" && !!user;
    if (isAuthenticated) {
      setIsOpen(false);
    }
  }, [isOpen, status, user]);

  return <LoginModal isOpen={isOpen} onClose={() => setIsOpen(false)} />;
};

export default LoginModalHost;

