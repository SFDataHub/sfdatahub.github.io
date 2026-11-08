import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LocalTitleNavigation from "../../components/ui/shared/LocalTitleNavigation";
import { DATA_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
import ContentShell from "../../components/ContentShell";
import { ScanManagementContent } from "../../components/ScanManagement/ScanManagementOverlay";
import { useUploadCenter } from "../../components/UploadCenter/UploadCenterContext";

export default function ScanManagement() {
  const { isOpen } = useUploadCenter();
  const { t } = useTranslation();
  const location = useLocation(), navigate = useNavigate();
  const returnTo = safeLocalReturn(location.state?.returnTo);
  return <ContentShell centerFramed={false} headerTransparent
    headerContent={<LocalTitleNavigation title={t("hubNavigation.scanManagement")}
      onBack={() => navigate(returnTo === location.pathname + location.search ? DATA_HUB : returnTo ?? DATA_HUB,
        { replace: true, state: location.state?.profileReturnState })} />}>
    <ScanManagementContent trackViews={!isOpen} initialTab={new URLSearchParams(location.search).get("tab") === "archive" ? "archive" : "scans"} />
  </ContentShell>;
}
