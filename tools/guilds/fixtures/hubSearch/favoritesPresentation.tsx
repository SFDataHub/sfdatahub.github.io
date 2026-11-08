import { flushSync } from "react-dom";
import { hubFavoritesStore } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { guildFavorite } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { localPlayerFavorite } from "../../../../src/lib/data-hub/hubFavoritesProjection";
import { resolveLocalProfileEntry } from "../../../../src/lib/data-hub/localProfileEntry";
import { parseLocalEntity } from "../../../../src/lib/data-hub/routes";
import { importGuildHubLocalScan } from "../../../../src/lib/guilds/localScanLibrary";
import { getGuildClassAccent } from "../../../../src/components/guilds/classColors";
import { GUILD_ACCENT_FALLBACK } from "../../../../src/lib/ui/guildAccent";

const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30));
async function until(test: () => boolean, label: string) {
  for (let i = 0; i < 1000; i++) { if (test()) return; await pause(); }
  throw Error(`${label}: ${document.body.innerText.slice(-1800)}`);
}
const menu = "#local-favorites-dialog";
const card = (identifier: string) => document.querySelector<HTMLElement>(`${menu} [data-favorite-id="player:f8::${identifier}"]`)!;
const snapshot = () => hubFavoritesStore.getSnapshot().snapshot!;
async function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector); assert(button, `button ${selector}`);
  flushSync(() => button!.click()); await pause();
}
async function committed() { await until(() => hubFavoritesStore.getSnapshot().status === "ready", "committed"); }
async function open() {
  if (!document.querySelector(menu)) await click("[data-local-favorites-trigger]");
  await until(() => document.querySelectorAll(`${menu} [data-favorite-id]`).length === snapshot()?.record.favorites.length, "complete mixed menu");
}
async function close() { if (document.querySelector(menu)) await click(`${menu} > header button`); }
function pixels(canvas: HTMLCanvasElement) {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) count++; return count;
}
let api: any;
let failWrites = false;
let poolReads = 0;
let favoriteWrites = 0;
const costs = () => ({ raw: api.reads.length, searchRaw: api.searchReads.length, core: api.cores.length, profiles: api.builds.length,
  pool: poolReads, ensures: api.summaryEnsures ?? 0, controllers: api.searchControllers.length, projectionWrites: api.projectionWrites, favoriteWrites });
const proof: Record<string, unknown> = {};

export function prepareFavoritePresentation(testApi: any) {
  api = testApi;
  const put = IDBObjectStore.prototype.put, getAll = IDBObjectStore.prototype.getAll, cursor = IDBObjectStore.prototype.openCursor;
  IDBObjectStore.prototype.put = function(value, ...args) {
    if (this.name === "state" && value.key === "hub-favorites") favoriteWrites++;
    if (failWrites && this.name === "state" && value.key === "hub-favorites") throw Error("controlled W25 favorite write failure");
    return put.call(this, value, ...args);
  };
  IDBObjectStore.prototype.getAll = function(...args) { if (this.name === "scans") poolReads++; return getAll.apply(this, args); };
  IDBObjectStore.prototype.openCursor = function(...args) { if (this.name === "scans") poolReads++; return cursor.apply(this, args); };
  (globalThis as any).w25 = { run, show, reload, close, proof };
}

async function show() {
  await open();
  await until(() => !!card("250")?.querySelector("canvas") && pixels(card("250").querySelector("canvas")!) > 1000, "actual favorite PortraitMaker pixels");
  const clip = card("250").querySelector<HTMLElement>("[data-player-portrait-clip]")!;
  const rect = clip.getBoundingClientRect(), style = getComputedStyle(clip);
  assert(rect.width === rect.height && style.overflow === "hidden" && style.clipPath === "circle(50%)", "circular inner clip at current width");
  assert(getComputedStyle(clip.parentElement!).overflow === "visible", "ring accents outside inner clip preserved");
  const guildImage = () => document.querySelector<HTMLImageElement>(`${menu} [data-favorite-id="guild:f8::250"] img`);
  document.querySelector<HTMLElement>(`${menu} [data-favorite-id="guild:f8::250"]`)!.scrollIntoView({ block: "nearest" });
  await until(() => !!guildImage() && guildImage()!.complete && guildImage()!.naturalWidth > 0 && guildImage()!.src.startsWith("data:") && guildImage()!.src.length > 6000, "actual CoA renderer image");
  const guild = guildImage()!;
  const guildCanvas = document.createElement("canvas"); guildCanvas.width = 240; guildCanvas.height = 240;
  guildCanvas.getContext("2d")!.drawImage(guild, 0, 0, 240, 240);
  assert(pixels(guildCanvas) > 1000, "actual CoA painted pixels");
  const classIcon = () => card("250").querySelector<HTMLImageElement>("[data-player-class-icon=\"1\"]");
  card("250").scrollIntoView({ block: "center" });
  await until(() => !!classIcon() && classIcon()!.complete && classIcon()!.naturalWidth > 0, "existing graphic warrior class icon");
  assert(getComputedStyle(guild.parentElement!).overflow === "visible", "guild artwork retains allowed overhang");
  assert(document.querySelector<HTMLElement>(menu)!.scrollWidth <= document.querySelector<HTMLElement>(menu)!.clientWidth, "drawer fits current viewport");
  const textLayout = ["250", "251", "252"].map(id => {
    const main = card(id).querySelector<HTMLButtonElement>("[data-player-favorite-card] > button:last-child")!;
    const name = main.querySelector<HTMLElement>("[data-favorite-name]")!;
    const guild = name.nextElementSibling!;
    const server = main.lastElementChild!.lastElementChild!;
    const nameGuildGap = guild.getBoundingClientRect().top - name.getBoundingClientRect().bottom;
    const serverBottomInset = main.getBoundingClientRect().bottom - server.getBoundingClientRect().bottom;
    assert(nameGuildGap >= 0 && nameGuildGap <= 3, `tight name/guild spacing for ${id}`);
    assert(serverBottomInset >= 12, `server inside inner frame for ${id}`);
    return { id, nameGuildGap, serverBottomInset, nameHeight: name.getBoundingClientRect().height };
  });
  const guildTextLayout = [...document.querySelectorAll<HTMLElement>(`${menu} [data-favorite-id^="guild:"]`)].map(row => {
    const name = row.querySelector<HTMLElement>("[data-favorite-name]")!;
    const main = name.closest("button")!;
    const memberChip = name.nextElementSibling!;
    const server = main.lastElementChild!.firstElementChild!;
    assert(/^\d+ \/ \d+$/.test(memberChip.textContent ?? ""), "member chip directly after guild name");
    assert(server.textContent === "F8", "guild server in footer after member chip");
    const nameChipGap = memberChip.getBoundingClientRect().top - name.getBoundingClientRect().bottom;
    const chipServerGap = server.getBoundingClientRect().top - memberChip.getBoundingClientRect().bottom;
    const serverBottomInset = main.getBoundingClientRect().bottom - server.getBoundingClientRect().bottom;
    assert(nameChipGap >= 0 && nameChipGap <= 3, "tight guild name/member chip spacing");
    assert(chipServerGap >= 0, "guild member chip and server never overlap");
    assert(serverBottomInset >= 12, "guild server inside inner frame");
    return { name: name.textContent, nameHeight: name.getBoundingClientRect().height, nameChipGap, chipServerGap, serverBottomInset };
  });
  proof.visual = { pixels: pixels(card("250").querySelector("canvas")!), clip: { width: rect.width, height: rect.height, overflow: style.overflow, clipPath: style.clipPath },
    guildImageBytes: guild.src.length, guildPixels: pixels(guildCanvas), guildOverflow: getComputedStyle(guild.parentElement!).overflow,
    classIcon: { naturalWidth: classIcon()!.naturalWidth, url: classIcon()!.src }, textLayout, guildTextLayout };
  card("250").scrollIntoView({ block: "center" }); await pause();
  return proof.visual;
}

async function run() {
  await close();
  assert(!document.querySelector("[data-hub-favorites]"), "Dashboard favorite block absent");
  api.navigate("/origin");
  await until(() => api.location.pathname === "/origin", "independent search consumer unmounted for menu measurement");
  const at = Date.UTC(2026, 9, 9, 15);
  const save = Array<number>(70).fill(0); save[3] = 123; save[8] = 1; save[9] = 403; save[10] = 2; save[11] = 3;
  save[13] = 2; save[14] = 1; save[18] = 1; save[19] = 1; save[20] = 1;
  const longName = "Favorite warrior with a very long player name";
  const longGuild = "An exceptionally long guild name";
  const raw = { players: [
    { identifier: "f8_net_p250", prefix: "f8_net", timestamp: at, name: longName, guildName: longGuild, guildIdentifier: "f8_net_g250", class: 1, level: 123, save, saveVersion: 2 },
    { identifier: "f8_net_p251", prefix: "f8_net", timestamp: at, name: "Favorite mage", guildName: longGuild, guildIdentifier: "f8_net_g250", class: 2, level: 124, save: save.map((n, i) => i === 20 ? 2 : i === 3 ? 124 : n), saveVersion: 2 },
    { identifier: "f8_net_p252", prefix: "f8_net", timestamp: at, name: "Legacy without metadata" },
  ], groups: [{ identifier: "f8_net_g250", prefix: "f8_net", timestamp: at, name: longGuild, coaString: "0000000000000000010203" }] };
  const source = await importGuildHubLocalScan("w25-favorite-images.json", JSON.stringify(raw));
  for (const id of [250, 251, 252]) {
    const profile = await resolveLocalProfileEntry({ entity: parseLocalEntity("player", "F8", `f8_net_p${id}`)!, observation: { kind: "exact", anchor: { source: source.scan.id, at } } });
    const favorite = localPlayerFavorite(profile)!;
    if (id === 252) { delete favorite.display.appearance; delete favorite.display.guildName; delete favorite.display.className; delete favorite.display.levelLabel; }
    await hubFavoritesStore.mutate({ type: "save", favorite });
  }
  await hubFavoritesStore.mutate({ type: "save", favorite: guildFavorite({ id: "f8_net_g250", guildId: "g250", server: "F8", name: longGuild,
    logoIdentifier: "f8_net_g250", memberCount: 3, coaString: "0000000000000000010203" }, 0, null, false) });
  api.navigate("/data-hub");
  await until(() => !!document.querySelector("[data-dashboard-search]"), "fresh idle Dashboard");
  assert(!api.searchControllers.some((controller: any) => !controller.inspect().stopped), "idle Dashboard starts no search pipeline");
  const before = JSON.stringify(snapshot()), work = costs();
  await open(); await show(); await pause();
  assert(JSON.stringify(snapshot()) === before, "display no implicit writes or metadata repair");
  assert(JSON.stringify(costs()) === JSON.stringify(work), `menu no Raw/pool/core/profile/summary/search work: ${JSON.stringify(costs())}`);
  proof.displayWork = Object.fromEntries(Object.entries(costs()).map(([key, value]) => [key, value - work[key as keyof typeof work]]));
  assert(JSON.stringify([...document.querySelectorAll(`${menu} [data-favorite-id]`)].map(e => e.getAttribute("data-favorite-id"))) === JSON.stringify(snapshot().record.favorites.map(f => f.id)), "mixed committed order, no grouping");
  assert(card("250").textContent?.includes(longGuild) && card("250").textContent?.includes("123") && card("250").textContent?.toLowerCase().includes("f8"), "same-observation name/guild/level/server");
  assert(getComputedStyle(card("250").querySelector("[data-player-favorite-card] > button:last-child")!).getPropertyValue("--guild-card-accent").trim() === getGuildClassAccent("warrior"), "existing warrior color");
  assert(getComputedStyle(card("251").querySelector("[data-player-favorite-card] > button:last-child")!).getPropertyValue("--guild-card-accent").trim() === getGuildClassAccent("mage"), "existing mage color");
  assert(getComputedStyle(card("252").querySelector("[data-player-favorite-card] > button:last-child")!).getPropertyValue("--guild-card-accent").trim() === GUILD_ACCENT_FALLBACK, "neutral unknown class");
  assert(!!card("252").querySelector("[data-player-portrait-fallback]") && card("252").textContent?.includes("Unknown"), "legacy placeholder and honest unknown fields");
  const path = JSON.stringify(api.location), compatibility = JSON.stringify(snapshot().compatibility);
  await click(`${menu} [data-guild-favorites-edit]`);
  await click(`${menu} [data-favorite-id="player:f8::250"] [data-player-favorite-card] > button:last-child`);
  assert(JSON.stringify(api.location) === path, "editing player click never navigates");
  await click(`${menu} button[aria-label="Move ${longName} down"]`); await committed();
  assert(snapshot().record.favorites.findIndex(f => f.id === "player:f8::250") > snapshot().record.favorites.findIndex(f => f.id === "player:f8::251"), "player existing adjacent move contract");
  const ordered = JSON.stringify(snapshot());
  failWrites = true;
  await click(`${menu} button[aria-label="Remove Legacy without metadata"]`);
  await until(() => hubFavoritesStore.getSnapshot().status === "error", "player remove write failure");
  assert(JSON.stringify(snapshot()) === ordered && !!card("252"), "failed player remove retains committed card");
  failWrites = false; await click(`${menu} [role="alert"] button`); await committed();
  assert(!snapshot().record.favorites.some(f => f.id === "player:f8::252"), "menu Retry commits player removal");
  assert(JSON.stringify(snapshot().compatibility) === compatibility, "player save/remove/move do not activate guild");
  // Restore a legacy card for screenshots and true document reload.
  const legacy = JSON.parse(ordered).record.favorites.find((f: any) => f.id === "player:f8::252");
  await hubFavoritesStore.mutate({ type: "save", favorite: legacy }); await committed();
  await click(`${menu} [data-guild-favorites-edit]`);
  sessionStorage.setItem("w25-favorite-snapshot", JSON.stringify(snapshot()));
  proof.menuWork = Object.fromEntries(Object.entries(costs()).map(([key, value]) => [key, value - work[key as keyof typeof work]]));
  proof.records = snapshot().record.favorites.length;
  await show(); return proof;
}

async function reload() {
  const before = costs(); await open(); await committed(); await show();
  assert(JSON.stringify(snapshot()) === sessionStorage.getItem("w25-favorite-snapshot"), "real document reload preserves metadata/order/legacy");
  assert(JSON.stringify(costs()) === JSON.stringify(before), "reload menu no heavy preparation");
  await close(); return { records: snapshot().record.favorites.length, visual: proof.visual };
}
