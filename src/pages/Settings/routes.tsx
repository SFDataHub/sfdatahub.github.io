import { Navigate, Route } from "react-router-dom";
import SettingsIndex from "../Settings";

export function settingsRouteElements() {
  return [
    <Route key="local-settings" path="/settings" element={<SettingsIndex />} />,
    <Route key="account-settings" path="/settings/account" element={<Navigate to="/settings?tab=account" replace />} />,
  ];
}
