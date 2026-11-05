/* VidTheme router test — run: node tests/router.test.mjs
   Durable harness (lives in the repo, not /tmp). */
import fs from "node:fs";
import { onRequest } from "../functions/[[path]].js";

const SITE = new URL("..", import.meta.url).pathname;
const indexHtml = fs.readFileSync(SITE + "/index.html", "utf8");
const videos = [
  { id: 1, slug: "hidden-waterfalls-of-the-rainforest", title: "Hidden Waterfalls of the Rainforest", duration: "3:52", thumbnail: "assets/thumbs/waterfall.svg", embed_url: "https://example.com/embed/1", tags: ["Nature"], category: "Nature", date: "2026-03-11", status: "published" },
  { id: 240, slug: "evening-skies-and-starlight-part-3", title: "Evening Skies and Starlight — Part 3", duration: "24:35", thumbnail: "assets/thumbs/evening.svg", embed_url: "https://example.com/embed/240", tags: ["Sky"], category: "Sky", date: "2026-03-12", status: "published" },
];
const settings = {
  siteTitle: "VidTheme: Free HD Videos by Category",
  siteDescription: "d", siteKeywords: "k",
  ogImage: "https://vidtehemsite.pages.dev/assets/og-image.svg", ogImageAlt: "",
  twitterCard: "summary_large_image", headerCode: "", ads: {}, brands: [],
  favicon: "", logoImage: "", logoAlt: "",
};

function mockCtx(path) {
  return {
    request: { url: "https://vidtehemsite.pages.dev" + path },
    env: {
      ASSETS: {
        fetch: async (u) => {
          const p = new URL(u).pathname;
          if (p === "/index.html") return { ok: true, text: async () => indexHtml };
          if (p === "/videos.json") return { ok: true, json: async () => videos };
          if (p === "/site-settings.json") return { ok: true, json: async () => settings };
          return { ok: false, status: 404 };
        },
      },
    },
    next: async () => new Response("passthrough", { status: 200 }),
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + " " + extra); }
}

// 1. Homepage 200 + default favicon
{
  const r = await onRequest(mockCtx("/"));
  const body = await r.text();
  check("home 200", r.status === 200, "got " + r.status);
  check("default favicon link", body.includes('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"'), body.slice(body.indexOf("rel=\"icon\""), body.indexOf("rel=\"icon\"") + 90));
  check("default apple-touch-icon", body.includes('<link rel="apple-touch-icon" href="/assets/favicon.svg"'));
}

// 2. Custom favicon from settings (png upload)
{
  settings.favicon = "/assets/uploads/my-icon.png";
  const r = await onRequest(mockCtx("/"));
  const body = await r.text();
  check("custom favicon link", body.includes('<link rel="icon" href="/assets/uploads/my-icon.png" type="image/png"'), body.slice(body.indexOf("rel=\"icon\""), body.indexOf("rel=\"icon\"") + 100));
  check("custom apple-touch-icon", body.includes('<link rel="apple-touch-icon" href="/assets/uploads/my-icon.png"'));
  settings.favicon = "";
}

// 3. Video page: correct category 200 + per-video meta + favicon
{
  settings.favicon = "/assets/uploads/my-icon.png";
  const r = await onRequest(mockCtx("/sky/evening-skies-and-starlight-part-3.html"));
  const body = await r.text();
  check("video 200", r.status === 200, "got " + r.status);
  check("video title in head", body.includes("Evening Skies and Starlight"));
  check("video og:video:duration 1475", body.includes('og:video:duration" content="1475"'));
  check("video page favicon", body.includes('href="/assets/uploads/my-icon.png"'));
  settings.favicon = "";
}

// 4. Wrong category -> 404 (video lives only under its own main category)
{
  const r = await onRequest(mockCtx("/travel/evening-skies-and-starlight-part-3.html"));
  check("wrong category 404", r.status === 404, "got " + r.status);
}

// 5. Legacy /video/ URL -> 301 to clean slug URL
{
  const r = await onRequest(mockCtx("/video/evening-skies-and-starlight-part-3-240.html"));
  check("legacy video 301", r.status === 301, "got " + r.status);
  check("legacy redirect target", r.headers.get("location") === "https://vidtehemsite.pages.dev/sky/evening-skies-and-starlight-part-3.html", r.headers.get("location"));
}

// 6. Legacy category URL with wrong category -> 404
{
  const r = await onRequest(mockCtx("/travel/evening-skies-and-starlight-part-3-240.html"));
  check("legacy wrong category 404", r.status === 404, "got " + r.status);
}

// 7. Unknown slug -> 404
{
  const r = await onRequest(mockCtx("/sky/no-such-video.html"));
  check("unknown slug 404", r.status === 404, "got " + r.status);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
