import { useUploadCenter } from "./UploadCenterContext";
import ScanManagementOverlay from "../ScanManagement/ScanManagementOverlay";

export default function UploadCenterModal() {
  const { isOpen, close } = useUploadCenter();

  return <ScanManagementOverlay isOpen={isOpen} onClose={close} />;
}
