const path = require("path");

function loadPlaywright() {
  const candidates = [
    "playwright",
    path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx", "420ff84f11983ee5", "node_modules", "playwright"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error("Playwright is not available");
}

const { chromium } = loadPlaywright();

const viewports = [1440, 1024, 768, 551, 425, 375, 320];
const baseUrl = process.argv[2] || "http://127.0.0.1:5177/";

const fakeUser = {
  id: "layout-test-user",
  name: "Layout Test",
  avatarUrl: "https://i.pravatar.cc/72?u=layout-test",
  roles: ["user"],
  accessGroups: [],
  favorites: {},
};

function boxInfo(box) {
  if (!box) return null;
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
    right: Math.round(box.x + box.width),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate((user) => {
      window.localStorage.setItem("sfh:auth:user", JSON.stringify({
        cachedAt: Date.now(),
        data: user,
      }));
    }, fakeUser);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);

    const data = await page.evaluate(() => {
      const visible = (el) => {
        if (!el) return false;
        const cs = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
      };
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right };
      };
      const q = (selector) => document.querySelector(selector);
      const qa = (selector) => Array.from(document.querySelectorAll(selector));
      const header = q("header[class*='topbar']");
      const left = q("[class*='topbarLeft']");
      const right = q("[class*='topbarRight']");
      const logo = q(".logo-dock .logo-img");
      const account = q("[class*='accountRoot']");
      const avatar = q("[class*='avatar'], [class*='avatarSpinnerShell']");
      const upload = q("[class*='upload']");
      const searchField = q("header [class*='searchWrap']:not([style*='display: none']) input");
      const searchButton = q("[class*='mobileSearchBtn']");
      const favoriteButton = qa("button[class*='btnIco']").find((button) => button.getAttribute("aria-label")?.toLowerCase().includes("favorite"));
      const notificationButton = qa("button[class*='btnIco']").find((button) => button.getAttribute("aria-label")?.toLowerCase().includes("notification"));

      const controls = { header, left, right, logo, account, avatar, upload, searchField, searchButton, favoriteButton, notificationButton };
      const boxes = Object.fromEntries(Object.entries(controls).map(([key, el]) => [key, rect(el)]));
      const vis = Object.fromEntries(Object.entries(controls).map(([key, el]) => [key, visible(el)]));
      const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const offenders = qa("body *").map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        if (r.left < -1 || r.right > window.innerWidth + 1) {
          return {
            tag: el.tagName.toLowerCase(),
            className: String(el.className || ""),
            x: Math.round(r.x),
            right: Math.round(r.right),
            width: Math.round(r.width),
          };
        }
        return null;
      }).filter(Boolean).slice(0, 8);

      const possibleSeparators = qa("header *").map((el) => {
        const cs = window.getComputedStyle(el);
        const before = window.getComputedStyle(el, "::before");
        const after = window.getComputedStyle(el, "::after");
        const r = el.getBoundingClientRect();
        const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
        const borderRight = parseFloat(cs.borderRightWidth) || 0;
        const hasPseudo =
          (before.content && before.content !== "none" && before.display !== "none") ||
          (after.content && after.content !== "none" && after.display !== "none");
        if ((borderLeft || borderRight || hasPseudo) && r.width > 0 && r.height > 0) {
          return {
            tag: el.tagName.toLowerCase(),
            className: String(el.className || ""),
            borderLeft,
            borderRight,
            before: before.content,
            after: after.content,
            x: Math.round(r.x),
            right: Math.round(r.right),
            width: Math.round(r.width),
            visible: visible(el),
          };
        }
        return null;
      }).filter(Boolean);

      const overlapPairs = [];
      const named = Object.entries(boxes).filter(([, b]) => b && b.width > 0 && b.height > 0);
      for (let i = 0; i < named.length; i += 1) {
        for (let j = i + 1; j < named.length; j += 1) {
          const [aName, a] = named[i];
          const [bName, b] = named[j];
          if (aName === "header" || bName === "header" || aName === "left" || bName === "left" || aName === "right" || bName === "right") continue;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          if (overlapX > 1 && overlapY > 1) overlapPairs.push([aName, bName, Math.round(overlapX), Math.round(overlapY)]);
        }
      }

      return { vis, boxes, overflow, offenders, possibleSeparators, overlapPairs };
    });

    results.push({
      width,
      overflow: data.overflow,
      visible: data.vis,
      boxes: Object.fromEntries(Object.entries(data.boxes).map(([key, box]) => [key, boxInfo(box)])),
      offenders: data.offenders,
      separators: data.possibleSeparators,
      overlaps: data.overlapPairs,
    });
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
