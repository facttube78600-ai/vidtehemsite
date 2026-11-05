/* VidTheme app.js test — run: node tests/app.test.mjs
   Durable harness (lives in the repo, not /tmp). */
import fs from "node:fs";
import { JSDOM } from "jsdom";

const SITE = new URL("..", import.meta.url).pathname;
const html = fs.readFileSync(SITE + "/index.html", "utf8");
const appJs = fs.readFileSync(SITE + "/assets/app.js", "utf8");
const allVideos = JSON.parse(fs.readFileSync(SITE + "/videos.json", "utf8"));
const baseSettings = JSON.parse(fs.readFileSync(SITE + "/site-settings.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0, fails = 0;
function check(name, cond, extra) {
  checks++;
  if (cond) console.log("  PASS " + name);
  else { fails++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

async function boot(settingsOverride = {}) {
  const settings = { ...baseSettings, ...settingsOverride };
  const dom = new JSDOM(html, {
    url: "https://vidtehemsite.pages.dev/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.IntersectionObserver = undefined;
  window.fetch = (u) => {
    const p = new URL(String(u), window.location.href).pathname;
    if (p.endsWith("site-settings.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(settings) });
    if (p.endsWith("videos.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(allVideos) });
    return Promise.reject(new Error("unexpected fetch " + u));
  };
  window.eval(appJs);
  await sleep(400);
  return { window, doc: window.document };
}

function nav(window, path) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
}

// 1. Custom favicon + logo from settings
{
  console.log("== site identity from settings ==");
  const { window, doc } = await boot({ favicon: "/assets/uploads/my-icon.png", logoImage: "/assets/uploads/my-logo.svg", logoAlt: "My Logo Alt" });
  const icon = doc.querySelector('link[rel="icon"]');
  check("favicon href from settings", icon && icon.getAttribute("href") === "/assets/uploads/my-icon.png", icon && icon.getAttribute("href"));
  const touch = doc.querySelector('link[rel="apple-touch-icon"]');
  check("apple-touch-icon from settings", touch && touch.getAttribute("href") === "/assets/uploads/my-icon.png", touch && touch.getAttribute("href"));
  const logoImg = doc.querySelector(".navbar .logo a img");
  check("logo image rendered", !!logoImg, logoImg && logoImg.outerHTML);
  check("logo img src", logoImg && logoImg.getAttribute("src") === "/assets/uploads/my-logo.svg", logoImg && logoImg.getAttribute("src"));
  check("logo img alt", logoImg && logoImg.getAttribute("alt") === "My Logo Alt", logoImg && logoImg.getAttribute("alt"));
}

// 2. Defaults when no favicon/logo set
{
  console.log("== site identity defaults ==");
  const { doc } = await boot({ favicon: "", logoImage: "", logoAlt: "" });
  const icon = doc.querySelector('link[rel="icon"]');
  check("default favicon href", icon && icon.getAttribute("href") === "/assets/favicon.svg", icon && icon.getAttribute("href"));
  const logoLink = doc.querySelector(".navbar .logo a");
  check("default text logo", logoLink && logoLink.textContent.trim() === "VidTheme" && !logoLink.querySelector("img"), logoLink && logoLink.textContent.trim());
}

// 3. Home renders cards
{
  console.log("== home + video routes ==");
  const { window, doc } = await boot();
  const cards = doc.querySelectorAll(".thumb_link");
  check("home renders cards", cards.length >= 1, String(cards.length));
  const firstLink = doc.querySelector(".thumb_link");
  check("card href is clean slug URL", firstLink && firstLink.getAttribute("href") === "/sky/evening-skies-and-starlight-part-3.html", firstLink && firstLink.getAttribute("href"));
}

// 4. Correct-category video renders; wrong category does NOT open
{
  const { window, doc } = await boot();
  const v = allVideos.find((x) => x.id === 1);
  nav(window, "/nature/" + v.slug + ".html");
  await sleep(150);
  check("category video renders player", !!doc.querySelector(".embed-responsive-item"));
  nav(window, "/travel/" + v.slug + ".html");
  await sleep(150);
  check("wrong category shows not found", !!doc.querySelector(".empty-note"));
  check("wrong category has no player", !doc.querySelector(".embed-responsive-item"));
  nav(window, "/video/" + v.slug + "-1.html");
  await sleep(150);
  check("legacy video renders player", !!doc.querySelector(".embed-responsive-item"));
  check("legacy URL normalised to clean slug URL", window.location.pathname === "/nature/" + v.slug + ".html", window.location.pathname);
}

console.log(`\n${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
