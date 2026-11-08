import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import {
  buildLocalFirstFeatureRequestKey,
  createLocalFirstFeatureAcquisitionCoordinator,
  type LocalFirstFeatureAcquisitionOptions,
  type LocalFirstFeatureAcquisitionResult,
  type LocalFirstFeatureRequest,
} from "../../lib/scanArchive/localFirstFeatureAcquisition";
import { resolveServer } from "../../lib/servers/serverResolver";

export type DashboardLocalFirstGuild = {
  id?: string | null;
  name?: string | null;
  server?: string | null;
  guildId?: string | null;
  logoIdentifier?: string | null;
};

export type DashboardLocalFirstAcquisitionOutcome =
  | { status: "skipped"; reason: "no-active-guild" | "invalid-server"; request: null; key: null }
  | { status: "completed"; request: LocalFirstFeatureRequest; key: string; result: LocalFirstFeatureAcquisitionResult };

export type DashboardLocalFirstAcquisitionCoordinator = ReturnType<typeof createLocalFirstFeatureAcquisitionCoordinator>;

export type DashboardLocalFirstAcquisitionOptions = LocalFirstFeatureAcquisitionOptions & {
  coordinator?: DashboardLocalFirstAcquisitionCoordinator;
  localScanSummaries?: readonly GuildHubScanSummary[];
};

const dashboardLocalFirstCoordinator = createLocalFirstFeatureAcquisitionCoordinator();

export function buildDashboardLocalFirstFeatureRequest(
  guild: DashboardLocalFirstGuild | null | undefined,
): LocalFirstFeatureRequest | null {
  if (!guild) return null;
  const server = resolveServer(String(guild.server ?? ""));
  if (!server) return null;

  return {
    target: { kind: "server", server: server.code },
    time: { kind: "latest" },
    dataKind: "both",
    completeness: "usable-snapshot",
  };
}

export async function acquireDashboardLocalFirstFeatureScans(
  guild: DashboardLocalFirstGuild | null | undefined,
  options: DashboardLocalFirstAcquisitionOptions = {},
): Promise<DashboardLocalFirstAcquisitionOutcome> {
  const request = buildDashboardLocalFirstFeatureRequest(guild);
  if (!request) {
    return {
      status: "skipped",
      reason: guild ? "invalid-server" : "no-active-guild",
      request: null,
      key: null,
    };
  }

  const { coordinator = dashboardLocalFirstCoordinator, ...acquisitionOptions } = options;
  const result = await coordinator.run(request, acquisitionOptions);
  return {
    status: "completed",
    request,
    key: buildLocalFirstFeatureRequestKey(request),
    result,
  };
}
