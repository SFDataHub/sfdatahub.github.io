import type {
  FusionIdentityDashboardInventory,
  FusionIdentityDashboardInventoryProgress,
  FusionIdentityDashboardInventoryTiming,
} from "./fusionDashboardInventory";

export type FusionDashboardInventoryWorkerRequest =
  | {
      type: "build-inventory";
      requestId: string;
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type FusionDashboardInventoryWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: FusionIdentityDashboardInventoryProgress;
    }
  | {
      type: "complete";
      requestId: string;
      inventory: FusionIdentityDashboardInventory;
      timings: FusionIdentityDashboardInventoryTiming[];
    }
  | {
      type: "error";
      requestId: string;
      phase?: FusionIdentityDashboardInventoryProgress["phase"];
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };
