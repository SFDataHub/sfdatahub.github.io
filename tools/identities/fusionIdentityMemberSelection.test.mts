import assert from "node:assert/strict";

import {
  clearSelectedIdentityIds,
  createGuildMemberStatusSelection,
  reconcileMemberSelectionFilters,
  removeSelectedIdentityId,
} from "../../src/lib/identities/fusionIdentityMemberSelection.ts";

const multiSelection = createGuildMemberStatusSelection({
  guildIdentifier: "f28_g1",
  guildName: "Guild A",
  status: "review",
  members: [
    { identifier: "f28_net_p1", name: "Player A" },
    { identifier: "f28_net_p2", name: "Player B" },
  ],
});

assert.equal(multiSelection.typeFilter, "player");
assert.equal(multiSelection.statusFilter, "review");
assert.deepEqual(multiSelection.selectedIdentityIds, [
  "f28_net_p1",
  "f28_net_p2",
]);
assert.deepEqual(multiSelection.selectionContext, {
  type: "guild-member-status",
  guildIdentifier: "f28_g1",
  guildName: "Guild A",
  status: "review",
});

const singleSelection = createGuildMemberStatusSelection({
  guildIdentifier: "f28_g1",
  guildName: "Guild A",
  status: "review",
  members: [{ identifier: "f28_net_p1", name: "Player A" }],
});
assert.deepEqual(singleSelection.selectedIdentityIds, ["f28_net_p1"]);

const afterRemoveOne = removeSelectedIdentityId(multiSelection, "f28_net_p1");
assert.deepEqual(afterRemoveOne.selectedIdentityIds, ["f28_net_p2"]);
assert.equal(afterRemoveOne.selectionContext?.guildIdentifier, "f28_g1");

const afterRemoveLast = removeSelectedIdentityId(afterRemoveOne, "f28_net_p2");
assert.deepEqual(afterRemoveLast.selectedIdentityIds, []);
assert.equal(afterRemoveLast.selectionContext, null);

const afterClearAll = clearSelectedIdentityIds(multiSelection);
assert.deepEqual(afterClearAll.selectedIdentityIds, []);
assert.equal(afterClearAll.selectionContext, null);

const afterTypeChange = reconcileMemberSelectionFilters({
  ...multiSelection,
  typeFilter: "guild",
});
assert.deepEqual(afterTypeChange.selectedIdentityIds, []);
assert.equal(afterTypeChange.selectionContext, null);

const afterStatusChange = reconcileMemberSelectionFilters({
  ...multiSelection,
  statusFilter: "ready",
});
assert.deepEqual(afterStatusChange.selectedIdentityIds, []);
assert.equal(afterStatusChange.selectionContext, null);

console.log("fusionIdentityMemberSelection.test.mts passed");
