/* VidTheme admin test — run: node tests/admin.test.mjs
   Durable harness (lives in the repo, not /tmp). */
import fs from "node:fs";
import { JSDOM } from "jsdom";

const SITE = new URL("..", import.meta.url).pathname;
const html = fs.readFileSync(SITE + "/admin.html", "utf8");
const adminScript = html.match(/<script>([\s\S]*)<\/script>/)[1];
const videos = [
  { id: 1, slug: "hidden-waterfalls", title: "Hidden Waterfalls", duration: "3:52", thumbnail: "assets/thumbs/waterfall.svg", embed_url: "https://example.com/embed/1", tags: ["waterfall", "rainforest", "river"], meta_keywords: "waterfall, rainforest, jungle", category: "Nature", date: "2026-03-11", status: "published" },
  { id: 2, slug: "mountain-sunrise", title: "Mountain Sunrise", duration: "2:10", thumbnail: "assets/thumbs/mountain.svg", embed_url: "https://example.com/embed/2", tags: ["mountain", "sunrise"], meta_keywords: "mountain, sunrise, peaks", category: "Mountains", date: "2026-03-12", status: "published" },
  { id: 3, slug: "ocean-waves", title: "Ocean Waves", duration: "1:45", thumbnail: "assets/thumbs/ocean.svg", embed_url: "https://example.com/embed/3", tags: ["ocean", "waves"], meta_keywords: "ocean, waves, beach", category: "Ocean Life", date: "2026-03-13", status: "published" },
];
const testSettings = {
  siteTitle: "VidTheme: Free HD Videos by Category",
  siteDescription: "d", siteKeywords: "k",
  ogImage: "https://vidtehemsite.pages.dev/assets/og-image.svg", ogImageAlt: "",
  favicon: "", logoImage: "", logoAlt: "",
  twitterCard: "summary_large_image", headerCode: "", ads: {},
  brands: [
    { label: "Nature", color: "#24975c", image: "", alt: "", link: "/tags/nature.html", enabled: true },
    { label: "Travel", color: "#3277d6", image: "", alt: "", link: "/tags/travel.html", enabled: true },
    { label: "Food", color: "#d36e2e", image: "", alt: "", link: "/tags/food.html", enabled: true },
    { label: "Ocean Life", color: "#1f9aa6", image: "", alt: "", link: "/tags/ocean-life.html", enabled: true },
    { label: "Mountains", color: "#6c5ca1", image: "", alt: "", link: "/tags/mountains.html", enabled: true },
    { label: "City Life", color: "#3c4451", image: "", alt: "", link: "/tags/city-life.html", enabled: true },
    { label: "Winter", color: "#5e93b5", image: "", alt: "", link: "/tags/winter.html", enabled: true },
    { label: "Sky", color: "#a13c8e", image: "", alt: "", link: "/tags/sky.html", enabled: true },
  ],
};

let checks = 0, fails = 0;
function check(name, cond, extra) {
  checks++;
  if (cond) console.log("  PASS " + name);
  else { fails++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setInput(el, value) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event("input", { bubbles: true }));
}

function boot(url, preseed = {}) {
  const posted = [];
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const doc = window.document;
  window.IntersectionObserver = undefined;
  for (const [k, v] of Object.entries(preseed)) window.localStorage.setItem(k, v);
  window.fetch = (u, opts = {}) => {
    const p = new URL(String(u), window.location.href).pathname;
    if (opts && opts.body) { try { posted.push(JSON.parse(opts.body)); } catch { /* ignore */ } }
    if (p.endsWith("site-settings.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(testSettings) });
    if (p.endsWith("videos.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(videos) });
    if (p === "/api/publish") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, message: "ok" }) });
    return Promise.reject(new Error("unexpected " + u));
  };
  window.eval(adminScript);
  return { window, doc, posted, vt: window.__vt };
}

function unlock(c) {
  c.doc.getElementById("gatePass").value = "pw";
  c.doc.getElementById("gateBtn").click();
}

// 1. Site Meta: favicon + logo render + save
{
  console.log("== site meta favicon + logo ==");
  const c = boot("https://vidtehemsite.pages.dev/admin");
  unlock(c);
  await sleep(300);
  c.vt.show("sitemeta");
  await sleep(100);
  check("favicon field exists", !!c.doc.getElementById("smFavicon"));
  check("logo field exists", !!c.doc.getElementById("smLogoImage"));
  setInput(c.doc.getElementById("smFavicon"), "/assets/uploads/my-icon.png");
  setInput(c.doc.getElementById("smLogoImage"), "/assets/uploads/my-logo.svg");
  setInput(c.doc.getElementById("smLogoAlt"), "My Logo Alt");
  c.doc.getElementById("smSaveBtn").click();
  await sleep(150);
  const smPost = c.posted.find((p) => p.settings !== undefined);
  check("site meta save posts favicon", !!smPost && smPost.settings.favicon === "/assets/uploads/my-icon.png", JSON.stringify(smPost && smPost.settings.favicon));
  check("site meta save posts logoImage", !!smPost && smPost.settings.logoImage === "/assets/uploads/my-logo.svg", JSON.stringify(smPost && smPost.settings.logoImage));
  check("site meta save posts logoAlt", !!smPost && smPost.settings.logoAlt === "My Logo Alt", JSON.stringify(smPost && smPost.settings.logoAlt));
}

// 2. Clear (x) buttons for favicon + logo
{
  console.log("== favicon/logo clear buttons ==");
  const c = boot("https://vidtehemsite.pages.dev/admin");
  unlock(c);
  await sleep(300);
  c.vt.show("sitemeta");
  setInput(c.doc.getElementById("smFavicon"), "/assets/uploads/my-icon.png");
  await sleep(50);
  check("favicon preview shows", c.doc.getElementById("smFavPrev").style.display !== "none");
  c.doc.getElementById("smFavClearBtn").click();
  await sleep(50);
  check("favicon x clears URL", c.doc.getElementById("smFavicon").value === "", c.doc.getElementById("smFavicon").value);
  check("favicon x hides preview", c.doc.getElementById("smFavPrev").style.display === "none");
  setInput(c.doc.getElementById("smLogoImage"), "/assets/uploads/my-logo.svg");
  setInput(c.doc.getElementById("smLogoAlt"), "Alt");
  c.doc.getElementById("smLogoClearBtn").click();
  await sleep(50);
  check("logo x clears URL + alt", c.doc.getElementById("smLogoImage").value === "" && c.doc.getElementById("smLogoAlt").value === "");
  check("logo x hides preview", c.doc.getElementById("smLogoPrev").style.display === "none");
}

// 3. Stay signed in across refresh
{
  console.log("== stay signed in ==");
  const c = boot("https://vidtehemsite.pages.dev/admin");
  unlock(c);
  await sleep(300);
  check("password remembered", c.window.localStorage.getItem("vt_admin_pass") === "pw");
  const d = boot("https://vidtehemsite.pages.dev/admin", { vt_admin_pass: "pw" });
  await sleep(300);
  check("auto-unlock on load", d.doc.getElementById("gate").classList.contains("hidden") && !d.doc.getElementById("app").classList.contains("hidden"));
  d.doc.getElementById("logoutBtn").click();
  await sleep(100);
  check("logout clears remembered password", d.window.localStorage.getItem("vt_admin_pass") === null);
}

// 4. Editor hash restore (refresh while editing)
{
  console.log("== editor hash restore ==");
  const a = boot("https://vidtehemsite.pages.dev/admin");
  unlock(a);
  await sleep(300);
  a.window.__vt.loadIntoForm(a.window.__vt.getVideos().find((v) => v.id === 2));
  await sleep(150);
  check("edit sets hash", a.window.location.hash === "#edit-2", a.window.location.hash);
  const b = boot("https://vidtehemsite.pages.dev/admin#edit-2");
  unlock(b);
  await sleep(300);
  check("refresh+unlock restores editor", b.doc.getElementById("v-editor").classList.contains("on"), "hash=" + b.window.location.hash);
}

console.log(`\n${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
