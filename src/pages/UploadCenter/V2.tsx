import React from "react";
import { ShieldOff } from "lucide-react";
import ContentShell from "../../components/ContentShell";
import UploadCenterV2JsonImport from "../../components/UploadCenter/UploadCenterV2JsonImport";
import { useUploadCenter } from "../../components/UploadCenter/UploadCenterContext";

export default function UploadCenterV2Page() {
  const { canUse } = useUploadCenter();

  if (!canUse) {
    return (
      <ContentShell title="Upload Center V2" subtitle="Upload Center access required" centerFramed mode="page">
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-[#B0C4D9]">
          <ShieldOff className="h-10 w-10 text-[#FF6B6B]" aria-hidden="true" />
          <p className="text-base font-semibold text-white">You don't have access to this feature.</p>
          <p>Contact an admin if you think you should be able to use Upload Center V2.</p>
        </div>
      </ContentShell>
    );
  }

  return (
    <ContentShell title="Upload Center V2" subtitle="Frontend JSON parser preview" centerFramed={false} mode="page">
      <UploadCenterV2JsonImport />
    </ContentShell>
  );
}
