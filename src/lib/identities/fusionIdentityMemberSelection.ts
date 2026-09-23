import type {
  FusionIdentityEntityType,
  FusionIdentityGuildMemberRef,
  FusionIdentityManagementStatus,
} from "./fusionIdentityManagement";

export type FusionIdentityStatusFilter = "all" | FusionIdentityManagementStatus;
export type FusionIdentityTypeFilter = "all" | FusionIdentityEntityType;
export type FusionIdentityMemberSelectionStatus = Extract<
  FusionIdentityManagementStatus,
  "review" | "unresolved" | "noHistoricalObservation" | "noHistory"
>;

export type FusionIdentityMemberSelectionContext = {
  type: "guild-member-status";
  guildIdentifier: string;
  guildName: string;
  status: FusionIdentityMemberSelectionStatus;
};

export type FusionIdentityMemberFilterState = {
  typeFilter: FusionIdentityTypeFilter;
  statusFilter: FusionIdentityStatusFilter;
  selectedIdentityIds: string[];
  selectionContext: FusionIdentityMemberSelectionContext | null;
};

const uniqueIdentifiers = (members: FusionIdentityGuildMemberRef[]) => [
  ...new Set(members.map((member) => member.identifier).filter(Boolean)),
];

export const createGuildMemberStatusSelection = ({
  guildIdentifier,
  guildName,
  status,
  members,
}: {
  guildIdentifier: string;
  guildName: string;
  status: FusionIdentityMemberSelectionStatus;
  members: FusionIdentityGuildMemberRef[];
}): FusionIdentityMemberFilterState => ({
  typeFilter: "player",
  statusFilter: status,
  selectedIdentityIds: uniqueIdentifiers(members),
  selectionContext: {
    type: "guild-member-status",
    guildIdentifier,
    guildName,
    status,
  },
});

export const removeSelectedIdentityId = (
  state: Pick<
    FusionIdentityMemberFilterState,
    "selectedIdentityIds" | "selectionContext"
  >,
  identifier: string,
): Pick<
  FusionIdentityMemberFilterState,
  "selectedIdentityIds" | "selectionContext"
> => {
  const selectedIdentityIds = state.selectedIdentityIds.filter(
    (selectedId) => selectedId !== identifier,
  );
  return {
    selectedIdentityIds,
    selectionContext: selectedIdentityIds.length
      ? state.selectionContext
      : null,
  };
};

export const clearSelectedIdentityIds = (
  state: Pick<
    FusionIdentityMemberFilterState,
    "selectedIdentityIds" | "selectionContext"
  >,
): Pick<
  FusionIdentityMemberFilterState,
  "selectedIdentityIds" | "selectionContext"
> => ({
  selectedIdentityIds: [],
  selectionContext: null,
});

export const reconcileMemberSelectionFilters = (
  state: FusionIdentityMemberFilterState,
): Pick<
  FusionIdentityMemberFilterState,
  "selectedIdentityIds" | "selectionContext"
> => {
  if (!state.selectionContext) {
    return {
      selectedIdentityIds: state.selectedIdentityIds,
      selectionContext: null,
    };
  }
  if (
    state.typeFilter !== "player" ||
    state.statusFilter !== state.selectionContext.status
  ) {
    return {
      selectedIdentityIds: [],
      selectionContext: null,
    };
  }
  return {
    selectedIdentityIds: state.selectedIdentityIds,
    selectionContext: state.selectionContext,
  };
};
