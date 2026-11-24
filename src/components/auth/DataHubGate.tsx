import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { getAppRoleFromUserRoles } from "../../lib/featureAccessConfig";
import logo from "../../assets/logo-sfdatahub.png";
import styles from "./DataHubGate.module.css";

export default function DataHubGate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const role = getAppRoleFromUserRoles(user?.roles);
  const allowed = status === "authenticated" && user && (
    role === "moderator" || role === "developer" || role === "admin" || user.roles?.includes("owner")
  );

  if (allowed) return <>{children}</>;

  return (
    <main className={styles.splash}>
      <img className={styles.logo} src={logo} alt="DataHub" />
      <p className={styles.message}>Goodbye</p>
    </main>
  );
}
