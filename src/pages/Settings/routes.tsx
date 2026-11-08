import { Navigate, Route } from "react-router-dom";
import FeatureGate from "../../components/FeatureGate";
import SettingsIndex from "../Settings";
import AccountSettingsPage from "./AccountSettingsPage";

/** Local preferences are public; the existing account feature rule is retained verbatim. */
export function settingsRouteElements() {
  return [
    <Route key="local-settings" path="/settings" element={<SettingsIndex />} />,
    <Route key="account-settings" path="/settings/account" element={
      <FeatureGate featureId="main.settings" route="/settings" fallback={<Navigate to="/" replace />}>
        <AccountSettingsPage />
      </FeatureGate>
    } />,
  ];
}
