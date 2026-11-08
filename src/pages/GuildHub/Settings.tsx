import { Navigate } from "react-router-dom";
import { PROFILE_SETTINGS_URL } from "../Settings";

/** The enclosing LocalHubGate continues to protect this compatibility entrance. */
export default function GuildHubSettings() {
  return <Navigate replace to={PROFILE_SETTINGS_URL} />;
}
