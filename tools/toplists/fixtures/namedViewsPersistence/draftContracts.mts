import assert from "node:assert/strict";
import { normalizeColumnView, normalizeColumnViewDraft, newToplistView } from "../../../../src/lib/toplists/toplistColumns";

for (const kind of ["players", "guilds"] as const) {
  const saved = normalizeColumnView({ mode: "custom", columns: ["name", "rank"] }, kind);
  const id = saved.activeId;
  let draft = { ...saved, views: saved.views.map(view => ({ ...view, name: "" })) };
  for (const columns of [["name", "rank", "server"], ["name", "server"], ["server", "name"]]) {
    draft = normalizeColumnViewDraft({ ...draft, views: draft.views.map(view => ({ ...view, columns })) }, kind);
    assert.equal(draft.activeId, id);
    assert.equal(draft.views[0].name, "");
    assert.deepEqual(draft.columns, columns);
  }
  assert.equal(normalizeColumnView(draft, kind).views.length, 0, "Invalid persisted names remain rejected");
  const switched = normalizeColumnViewDraft({ ...draft, activeId: "default" }, kind);
  assert.equal(switched.views[0].name, "");
  assert.equal(normalizeColumnViewDraft({ ...switched, activeId: id }, kind).activeId, id);
  const added = newToplistView(draft, kind, "Another", true);
  assert.equal(added.views.find(view => view.id === id)?.name, "");
  assert.deepEqual(added.columns, draft.columns);
  const valid = normalizeColumnView({ ...draft, views: draft.views.map(view => ({ ...view, name: " Renamed " })) }, kind);
  assert.equal(valid.activeId, id);
  assert.equal(valid.views[0].name, "Renamed");
  assert.deepEqual(valid.columns, ["server", "name"]);
  assert.deepEqual(saved.columns, ["name", "rank"], "Draft edits leave the saved basis available for Discard");
  console.log(`PASS ${kind}: empty draft survives add/remove/move, switching and creation; stored validation, identity and saved basis retained`);
}
