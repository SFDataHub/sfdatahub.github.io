import {
  buildLocalFirstFusionScopeSegments,
} from "../../lib/guilds/localFirstScanResolver";
import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import {
  listFusionIdentityAnalysisScopes,
  type FusionIdentityAnalysisScope,
} from "../../lib/identities/fusionIdentityScopes";
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

const findDashboardFusionScope = (serverCode: string): FusionIdentityAnalysisScope | null => {
  const scopes = listFusionIdentityAnalysisScopes();
  return (
    scopes.find(
      (scope) =>
        scope.analysisSupported &&
        scope.temporalStatus !== "future" &&
        scope.targetServerCode === serverCode,
    ) ??
    scopes.find(
      (scope) =>
        scope.analysisSupported &&
        scope.temporalStatus !== "future" &&
        scope.lineageServerCodes.includes(serverCode),
    ) ??
    null
  );
};

export function buildDashboardLocalFirstFeatureRequest(
  guild: DashboardLocalFirstGuild | null | undefined,
): LocalFirstFeatureRequest | null {
  if (!guild) return null;
  const server = resolveServer(String(guild.server ?? ""));
  if (!server) return null;

  const scope = findDashboardFusionScope(server.code);
  return {
    target: scope ? { kind: "fusion-scope", scope } : { kind: "server", server: server.code },
    ...(scope ? { segments: buildLocalFirstFusionScopeSegments(scope) } : {}),
    time: { kind: "all" },
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
