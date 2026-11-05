/* VidTheme publish.js test — run: node tests/publish.test.mjs
   Durable harness (lives in the repo, not /tmp). */
import { onRequest } from "../functions/api/publish.js";

const repo = {
  "videos.json": JSON.parse(JSON.stringify([
    { id: 1, slug: "hidden-waterfalls-of-the-rainforest", title: "Hidden Waterfalls of the Rainforest", duration: "3:52", thumbnail: "assets/thumbs/waterfall.svg", embed_url: "https://example.com/embed/1", tags: ["Nature"], category: "Nature", date: "2026-03-11", status: "published" },
  ])),
  "site-settings.json": JSON.parse(JSON.stringify({
    siteTitle: "VidTheme: Free HD Videos by Category", siteDescription: "d", siteKeywords: "k",
    ogImage: "https://vidtehemsite.pages.dev/assets/og-image.svg", twitterCard: "summary_large_image",
    headerCode: "", ads: {}, brands: [],
  })),
};
function b64encode(str) { return Buffer.from(str, "utf8").toString("base64"); }
function b64decode(str) { return Buffer.from(str, "base64").toString("utf8"); }

// Minimal GitHub Contents API stub.
globalThis.fetch = async (url, opts = {}) => {
  const m = String(url).match(/\/contents\/([^?]+)/);
  const path = m ? m[1] : "";
  if (opts.method === "PUT") {
    const body = JSON.parse(opts.body);
    let decoded;
    try { decoded = JSON.parse(b64decode(body.content)); } catch { decoded = b64decode(body.content); }
    repo[path] = decoded;
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
  }
  if (repo[path] === undefined) return { ok: false, status: 404, json: async () => ({}), text: async () => "{}" };
  return { ok: true, status: 200, json: async () => ({ sha: "abc123", content: b64encode(JSON.stringify(repo[path])) }), text: async () => "{}" };
};

function ctx(body) {
  return {
    env: { ADMIN_PASSWORD: "secret123", GITHUB_TOKEN: "tok", GITHUB_REPO: "facttube78600-ai/vidtehemsite", GITHUB_BRANCH: "main" },
    request: { method: "POST", json: async () => body },
  };
}
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + " " + extra); }
}

// 1. Wrong password -> 401
{
  const r = await onRequest(ctx({ password: "nope", video: { id: 1 } }));
  check("wrong password 401", r.status === 401, "got " + r.status);
}

// 2. Settings save with favicon + logo -> stored
{
  const r = await onRequest(ctx({ password: "secret123", settings: { favicon: "/assets/uploads/my-icon.png", logoImage: "/assets/uploads/my-logo.svg", logoAlt: "VidTheme logo" } }));
  const j = await r.json();
  check("favicon/logo settings 200", r.status === 200, "got " + r.status + " " + JSON.stringify(j));
  check("favicon stored", repo["site-settings.json"].favicon === "/assets/uploads/my-icon.png", repo["site-settings.json"].favicon);
  check("logoImage stored", repo["site-settings.json"].logoImage === "/assets/uploads/my-logo.svg");
  check("logoAlt stored", repo["site-settings.json"].logoAlt === "VidTheme logo");
  check("old settings kept (merge)", repo["site-settings.json"].siteTitle === "VidTheme: Free HD Videos by Category");
}

// 3. Settings with < in favicon -> 400
{
  const r = await onRequest(ctx({ password: "secret123", settings: { favicon: "/x.png<script>" } }));
  check("favicon with <> rejected 400", r.status === 400, "got " + r.status);
}

// 4. Image upload .ico allowed (favicons)
{
  const r = await onRequest(ctx({ password: "secret123", image: { filename: "My Favicon.ICO", data: b64encode("fake-ico-bytes") } }));
  const j = await r.json();
  check("ico upload 200", r.status === 200, "got " + r.status + " " + JSON.stringify(j));
  check("ico path returned", typeof j.path === "string" && j.path.endsWith(".ico"), j.path);
}

// 5. Image upload .exe rejected
{
  const r = await onRequest(ctx({ password: "secret123", image: { filename: "evil.exe", data: b64encode("x") } }));
  check("exe upload rejected 400", r.status === 400, "got " + r.status);
}

// 6. Video publish smoke (with thumbnail -> no auto-generation)
{
  const v = { id: 2, slug: "test-video", title: "Test Video", duration: "1:00", thumbnail: "assets/thumbs/t.svg", embed_url: "https://example.com/embed/2", tags: ["Nature"], category: "Nature" };
  const r = await onRequest(ctx({ password: "secret123", video: v }));
  check("video publish 200", r.status === 200, "got " + r.status);
  check("video stored", repo["videos.json"].find((x) => x.id === 2).slug === "test-video");
}

// 7. Duplicate slug rejected
{
  const dup = { id: 7, slug: "test-video", title: "Dup Slug", embed_url: "https://example.com/embed/7", tags: ["Nature"], category: "Nature" };
  const r = await onRequest(ctx({ password: "secret123", video: dup }));
  check("duplicate slug 400", r.status === 400, "got " + r.status);
}

// 8. Published video with NO thumbnail -> SVG auto-generated
{
  const v = { id: 8, title: "A Very Long Title That Wraps Across Lines For Testing", embed_url: "https://example.com/embed/8", tags: ["Travel"], category: "Travel" };
  const r = await onRequest(ctx({ password: "secret123", video: v }));
  const j = await r.json();
  check("auto-thumb publish 200", r.status === 200, "got " + r.status + " " + JSON.stringify(j));
  check("auto-thumb path in response", j.generatedThumbnail === "/assets/uploads/a-very-long-title-that-wraps-across-lines-for-testing-thumb.svg", j.generatedThumbnail);
  const svg = repo["assets/uploads/a-very-long-title-that-wraps-across-lines-for-testing-thumb.svg"];
  check("auto-thumb SVG saved", typeof svg === "string" && svg.indexOf("<svg") === 0, typeof svg);
  check("auto-thumb SVG uses category colour", typeof svg === "string" && svg.indexOf("#3277d6") !== -1);
}

// 9. Draft with no thumbnail -> NO auto-generation
{
  const v = { id: 9, title: "Draft Without Thumb", embed_url: "https://example.com/embed/9", tags: ["Food"], category: "Food", status: "draft" };
  const r = await onRequest(ctx({ password: "secret123", video: v }));
  check("draft no-thumb 200", r.status === 200, "got " + r.status);
  check("draft thumbnail stays empty", repo["videos.json"].find((x) => x.id === 9).thumbnail === "");
  check("draft creates no SVG", repo["assets/uploads/draft-without-thumb-thumb.svg"] === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
