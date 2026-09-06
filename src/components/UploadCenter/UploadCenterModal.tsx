import React from "react";
import { useUploadCenter } from "./UploadCenterContext";
import ScanManagementOverlay from "../ScanManagement/ScanManagementOverlay";

export default function UploadCenterModal() {
  const { isOpen, close, canUse } = useUploadCenter();

  return <ScanManagementOverlay isOpen={isOpen && canUse} onClose={close} />;
}
