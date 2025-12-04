import { useEffect } from "react";

import { useUploadCenter } from "../../components/UploadCenter/UploadCenterContext";

export default function UploadCenterPage() {
  const { open, canUse } = useUploadCenter();

  useEffect(() => {
    if (canUse) {
      open({ tab: "csv" });
    }
  }, [canUse, open]);

  return null;
}
