/* VidTheme — Publish API (Cloudflare Pages Function).
 *
 * POST /api/publish  { password, video, _delete? }
 * POST /api/publish  { password, settings }
 *
 * The admin password and the GitHub token are NOT in this file.
 * They come from Cloudflare Pages environment variables:
 *   ADMIN_PASSWORD — the password the admin dashboard sends.
 *   GITHUB_TOKEN   — fine-grained token, this repository only,
 *                    Contents: Read and write.
 *   GITHUB_REPO    — optional, "owner/repo". Defaults to the repo
 *                    this site lives in.
 *   GITHUB_BRANCH  — optional, defaults to "main".
 *
 * Flow: check password -> fetch the current file from GitHub
 * -> upsert (or delete) the video, or replace the site settings
 * -> commit the updated file back via the GitHub Contents API
 * -> the public site fetches the new file on its next load,
 * with no redeploy.
 *
 * Video model: { id, slug, title, duration, thumbnail, embed_url,
 *   tags: [free-form strings], category: one of TAGS (drives the
 *   video URL /<category-slug>/<slug>-<id>.html), date, status,
 *   seo_title, meta_description, meta_keywords, focus_keyword,
 *   og_title, og_description, og_image, twitter_card, canonical }.
 *
 * Settings model (site-settings.json): { siteTitle,
 *   siteDescription, siteKeywords, ogImage, twitterCard,
 *   headerCode, ads: { <placement>: { enabled, code } },
 *   brands: [{ label, color, image, link, enabled }] }.
 * headerCode and ad code may contain HTML/JS (Analytics, AdSense)
 * — they come from the password-checked admin only, so they are
 * stored as-is; every other text field rejects < and >. */

const TAGS = ["Nature", "Travel", "Food", "Ocean Life", "Mountains", "City Life", "Winter", "Sky"];
const AD_PLACEMENTS = ["homeTop", "homeBottomRect", "homeBottomWide", "videoTop", "videoMidRect1", "videoMidWide", "videoMidRect2", "videoBottomRect", "videoBottomWide"];
const REPO_DEFAULT = "facttube78600-ai/vidtehemsite";
const BRANCH_DEFAULT = "main";

/* Base64 helpers using only Web-standard APIs (no Node Buffer). */
function b64decode(str) {
  const bin = atob(str.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function noAngle(s) {
  return typeof s === "string" && !/[<>]/.test(s);
}

/* ---------- Auto-generated SVG thumbnail ----------
   When a video is published with no thumbnail, the server draws
   one in the same style as the placeholder thumbs in
   assets/thumbs/ (category-colour gradient + title + VidTheme),
   stores it under assets/uploads/<slug>-thumb.svg and uses it as
   the video's thumbnail. */
const CATEGORY_COLORS = {
  "Nature": ["#24975c", "#4db87e"],
  "Travel": ["#3277d6", "#6aa5e8"],
  "Food": ["#d36e2e", "#e89a5f"],
  "Ocean Life": ["#1f9aa6", "#4fc3cf"],
  "Mountains": ["#6c5ca1", "#9a8cc4"],
  "City Life": ["#3c4451", "#6b7686"],
  "Winter": ["#5e93b5", "#8fb8d2"],
  "Sky": ["#a13c8e", "#c46eb5"],
};
function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function wrapTitleLines(title, maxPerLine, maxLines) {
  const words = String(title || "Video").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > maxPerLine && cur) { lines.push(cur); cur = w; }
    else cur = next;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/…?$/, "…");
  }
  return lines.slice(0, maxLines);
}
function buildThumbSvg(title, category) {
  const cols = CATEGORY_COLORS[category] || ["#3c4451", "#6b7686"];
  const lines = wrapTitleLines(title, 26, 3);
  const size = lines.length === 1 ? 42 : lines.length === 2 ? 36 : 32;
  const startY = 185 - (lines.length - 1) * 26;
  const text = lines.map((l, i) =>
    '<text x="320" y="' + (startY + i * 52) + '" font-family="Arial,Helvetica,sans-serif" font-size="' + size + '" font-weight="bold" fill="#ffffff" text-anchor="middle">' + escapeXml(l) + "</text>"
  ).join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + cols[0] + '"/><stop offset="1" stop-color="' + cols[1] + '"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/>' + text + '<text x="320" y="320" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="#ffffff" opacity="0.85" text-anchor="middle">VidTheme</text></svg>';
}

/* ---- Image upload (admin) ---- */
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; /* 5 MB */
const IMAGE_UPLOAD_DIR = "assets/uploads/";
function imageExt(filename) {
  const base = String(filename || "").split(/[\\/]/).pop().toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}
/* SEO-friendly file name: lower-case, words joined with hyphens,
   timestamp-prefixed so uploads never collide. */
function safeImageName(filename) {
  const base = String(filename || "").split(/[\\/]/).pop().trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot) : "";
  let stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (!stem) stem = "image";
  if (!IMAGE_EXTS.includes(ext)) return null;
  return Date.now() + "-" + stem + ext;
}
function validateImageUpload(img) {
  if (!img || typeof img !== "object") return "image is required";
  if (typeof img.filename !== "string" || !img.filename.trim()) return "image.filename is required";
  if (!IMAGE_EXTS.includes(imageExt(img.filename))) return "image file type must be jpg, jpeg, png, webp, gif or svg";
  if (typeof img.data !== "string" || !img.data.trim()) return "image.data is required (base64)";
  if (!/^[A-Za-z0-9+/=\s]+$/.test(img.data)) return "image.data must be base64";
  const bytes = Math.floor(img.data.replace(/\s/g, "").length * 3 / 4);
  if (bytes > IMAGE_MAX_BYTES) return "image is too large (max 5 MB)";
  return null;
}

function validateVideo(v) {
  if (!v || typeof v !== "object") return "video is required";
  if (typeof v.id !== "number" || !Number.isInteger(v.id) || v.id < 1) return "video.id must be a positive integer";
  if (!v.title || typeof v.title !== "string" || v.title.length > 200) return "video.title is required (max 200 chars)";
  if (/[<>]/.test(v.title)) return "video.title must not contain < or >";
  if (v.slug && (typeof v.slug !== "string" || !/^[a-z0-9-]+$/.test(v.slug))) return "video.slug is invalid";
  if (!v.embed_url || typeof v.embed_url !== "string") return "video.embed_url is required";
  let url;
  try { url = new URL(v.embed_url); } catch { return "video.embed_url must be a valid URL"; }
  if (url.protocol !== "https:") return "video.embed_url must use https";
  if (v.duration && !/^(\d{1,3}:\d{2}|\d{1,2}:\d{2}:\d{2})$/.test(v.duration)) return "video.duration must look like mm:ss or hh:mm:ss";
  if (v.thumbnail && typeof v.thumbnail !== "string") return "video.thumbnail is invalid";
  if (v.thumbnail && v.thumbnail.length > 500) return "video.thumbnail is too long";
  if (!v.category || !TAGS.includes(v.category)) return "video.category must be one of: " + TAGS.join(", ");
  if (v.tags !== undefined) {
    if (!Array.isArray(v.tags)) return "video.tags must be an array";
    for (const t of v.tags) {
      if (typeof t !== "string" || !t.trim() || t.length > 60 || /[<>]/.test(t)) return "video.tags entries must be short text (max 60 chars, no < >)";
    }
  }
  if (v.date && !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return "video.date must be YYYY-MM-DD";
  if (v.status !== undefined && v.status !== "published" && v.status !== "draft") return "video.status must be published or draft";
  if (v.seo_title !== undefined && (typeof v.seo_title !== "string" || v.seo_title.length > 70 || /[<>]/.test(v.seo_title))) return "video.seo_title is invalid (max 70 chars, no < >)";
  if (v.meta_description !== undefined && (typeof v.meta_description !== "string" || v.meta_description.length > 180 || /[<>]/.test(v.meta_description))) return "video.meta_description is invalid (max 180 chars, no < >)";
  if (v.meta_keywords !== undefined && (typeof v.meta_keywords !== "string" || v.meta_keywords.length > 500 || /[<>]/.test(v.meta_keywords))) return "video.meta_keywords is invalid (max 500 chars, no < >)";
  if (v.focus_keyword !== undefined && (typeof v.focus_keyword !== "string" || v.focus_keyword.length > 100 || /[<>]/.test(v.focus_keyword))) return "video.focus_keyword is invalid (max 100 chars, no < >)";
  if (v.og_title !== undefined && (typeof v.og_title !== "string" || v.og_title.length > 200 || /[<>]/.test(v.og_title))) return "video.og_title is invalid (max 200 chars, no < >)";
  if (v.og_description !== undefined && (typeof v.og_description !== "string" || v.og_description.length > 300 || /[<>]/.test(v.og_description))) return "video.og_description is invalid (max 300 chars, no < >)";
  if (v.og_image !== undefined && (typeof v.og_image !== "string" || v.og_image.length > 500 || /[<>]/.test(v.og_image))) return "video.og_image is invalid (max 500 chars, no < >)";
  if (v.thumb_alt !== undefined && (typeof v.thumb_alt !== "string" || v.thumb_alt.length > 200 || /[<>]/.test(v.thumb_alt))) return "video.thumb_alt is invalid (max 200 chars, no < >)";
  if (v.og_image_alt !== undefined && (typeof v.og_image_alt !== "string" || v.og_image_alt.length > 200 || /[<>]/.test(v.og_image_alt))) return "video.og_image_alt is invalid (max 200 chars, no < >)";
  if (v.twitter_card !== undefined && v.twitter_card !== "summary" && v.twitter_card !== "summary_large_image") return "video.twitter_card must be summary or summary_large_image";
  if (v.canonical !== undefined && (typeof v.canonical !== "string" || v.canonical.length > 500 || /[<>]/.test(v.canonical))) return "video.canonical is invalid (max 500 chars, no < >)";
  if (v.canonical && !/^https:\/\//.test(v.canonical)) return "video.canonical must be an https URL";
  return null;
}

function normalise(v) {
  const tags = Array.isArray(v.tags) ? v.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  return {
    id: v.id,
    slug: v.slug || slugify(v.title),
    title: v.title.trim(),
    duration: v.duration || "",
    thumbnail: v.thumbnail || "",
    embed_url: v.embed_url,
    tags,
    category: v.category,
    date: v.date || new Date().toISOString().slice(0, 10),
    status: v.status === "draft" ? "draft" : "published",
    seo_title: (v.seo_title || "").trim(),
    meta_description: (v.meta_description || "").trim(),
    meta_keywords: (v.meta_keywords || "").trim(),
    focus_keyword: (v.focus_keyword || "").trim(),
    og_title: (v.og_title || "").trim(),
    og_description: (v.og_description || "").trim(),
    og_image: (v.og_image || "").trim(),
    thumb_alt: (v.thumb_alt || "").trim(),
    og_image_alt: (v.og_image_alt || "").trim(),
    twitter_card: v.twitter_card === "summary" ? "summary" : "summary_large_image",
    canonical: (v.canonical || "").trim(),
  };
}

function validateSettings(s) {
  if (!s || typeof s !== "object") return "settings is required";
  if (s.siteTitle !== undefined && (typeof s.siteTitle !== "string" || s.siteTitle.length > 100 || !noAngle(s.siteTitle))) return "settings.siteTitle is invalid (max 100 chars, no < >)";
  if (s.siteDescription !== undefined && (typeof s.siteDescription !== "string" || s.siteDescription.length > 200 || !noAngle(s.siteDescription))) return "settings.siteDescription is invalid (max 200 chars, no < >)";
  if (s.siteKeywords !== undefined && (typeof s.siteKeywords !== "string" || s.siteKeywords.length > 500 || !noAngle(s.siteKeywords))) return "settings.siteKeywords is invalid (max 500 chars, no < >)";
  if (s.ogImage !== undefined && (typeof s.ogImage !== "string" || s.ogImage.length > 500 || !noAngle(s.ogImage))) return "settings.ogImage is invalid (max 500 chars, no < >)";
  if (s.ogImageAlt !== undefined && (typeof s.ogImageAlt !== "string" || s.ogImageAlt.length > 200 || !noAngle(s.ogImageAlt))) return "settings.ogImageAlt is invalid (max 200 chars, no < >)";
  if (s.twitterCard !== undefined && s.twitterCard !== "summary" && s.twitterCard !== "summary_large_image") return "settings.twitterCard must be summary or summary_large_image";
  if (s.headerCode !== undefined && (typeof s.headerCode !== "string" || s.headerCode.length > 20000)) return "settings.headerCode is too long (max 20000 chars)";
  if (s.ads !== undefined) {
    if (typeof s.ads !== "object" || Array.isArray(s.ads)) return "settings.ads must be an object";
    for (const key of Object.keys(s.ads)) {
      if (!AD_PLACEMENTS.includes(key)) return "unknown ad placement: " + key;
      const a = s.ads[key];
      if (!a || typeof a !== "object" || typeof a.enabled !== "boolean" || typeof a.code !== "string" || a.code.length > 10000) return "settings.ads." + key + " must be {enabled, code} (code max 10000 chars)";
    }
  }
  if (s.brands !== undefined) {
    if (!Array.isArray(s.brands) || s.brands.length > 12) return "settings.brands must be an array (max 12)";
    for (const b of s.brands) {
      if (!b || typeof b !== "object") return "settings.brands entries must be objects";
      if (typeof b.label !== "string" || !b.label.trim() || b.label.length > 40 || !noAngle(b.label)) return "brand label is invalid (max 40 chars, no < >)";
      if (typeof b.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(b.color)) return "brand color must be a #rrggbb hex value";
      if (b.image !== undefined && (typeof b.image !== "string" || b.image.length > 500 || !noAngle(b.image))) return "brand image is invalid (max 500 chars, no < >)";
      if (b.alt !== undefined && (typeof b.alt !== "string" || b.alt.length > 100 || !noAngle(b.alt))) return "brand alt is invalid (max 100 chars, no < >)";
      if (typeof b.link !== "string" || !b.link.trim() || b.link.length > 500 || !noAngle(b.link)) return "brand link is invalid (max 500 chars, no < >)";
      if (typeof b.enabled !== "boolean") return "brand enabled must be true or false";
    }
  }
  return null;
}

function normaliseSettings(s) {
  const out = {};
  if (s.siteTitle !== undefined) out.siteTitle = s.siteTitle.trim();
  if (s.siteDescription !== undefined) out.siteDescription = s.siteDescription.trim();
  if (s.siteKeywords !== undefined) out.siteKeywords = s.siteKeywords.trim();
  if (s.ogImage !== undefined) out.ogImage = s.ogImage.trim();
  if (s.ogImageAlt !== undefined) out.ogImageAlt = s.ogImageAlt.trim();
  if (s.twitterCard !== undefined) out.twitterCard = s.twitterCard;
  if (s.headerCode !== undefined) out.headerCode = s.headerCode;
  if (s.ads !== undefined) {
    out.ads = {};
    for (const key of AD_PLACEMENTS) {
      if (s.ads[key] !== undefined) out.ads[key] = { enabled: !!s.ads[key].enabled, code: s.ads[key].code || "" };
    }
  }
  if (s.brands !== undefined) {
    out.brands = s.brands.map((b) => ({
      label: b.label.trim(),
      color: b.color,
      image: (b.image || "").trim(),
      alt: (b.alt || "").trim(),
      link: b.link.trim(),
      enabled: !!b.enabled,
    }));
  }
  return out;
}

export async function onRequestPost(context) {
  const env = context.env || {};
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!env.ADMIN_PASSWORD || !safeEqual(body.password || "", env.ADMIN_PASSWORD)) {
    return json(401, { error: "Wrong admin password" });
  }
  if (!env.GITHUB_TOKEN) {
    return json(500, { error: "GITHUB_TOKEN is not configured on the server" });
  }

  const repo = env.GITHUB_REPO || REPO_DEFAULT;
  const branch = env.GITHUB_BRANCH || BRANCH_DEFAULT;
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) return json(500, { error: "GITHUB_REPO must be owner/repo" });

  const headers = {
    Authorization: "Bearer " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "VidTheme-Publish",
  };

  async function readFile(path) {
    const apiBase = "https://api.github.com/repos/" + owner + "/" + repoName + "/contents/" + path;
    const res = await fetch(apiBase + "?ref=" + encodeURIComponent(branch), { headers });
    if (res.status === 404) return { sha: null, data: null };
    if (res.status !== 200) throw new Error("Could not read " + path + " from GitHub (HTTP " + res.status + ")");
    const data = await res.json();
    let parsed = null;
    try { parsed = JSON.parse(b64decode(data.content)); } catch { throw new Error("Current " + path + " on GitHub is not valid JSON"); }
    return { sha: data.sha, data: parsed };
  }

  async function writeFile(path, sha, obj, message) {
    const apiBase = "https://api.github.com/repos/" + owner + "/" + repoName + "/contents/" + path;
    const put = await fetch(apiBase, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: b64encode(JSON.stringify(obj, null, 2) + "\n"), branch, ...(sha ? { sha } : {}) }),
    });
    if (!put.ok) {
      const detail = await put.text();
      throw new Error("GitHub commit failed (HTTP " + put.status + "): " + detail.slice(0, 300));
    }
  }

  async function writeBinary(path, sha, base64content, message) {
    const apiBase = "https://api.github.com/repos/" + owner + "/" + repoName + "/contents/" + path;
    const put = await fetch(apiBase, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: base64content.replace(/\s/g, ""), branch, ...(sha ? { sha } : {}) }),
    });
    if (!put.ok) {
      const detail = await put.text();
      throw new Error("GitHub commit failed (HTTP " + put.status + "): " + detail.slice(0, 300));
    }
  }

  async function getSha(path) {
    const apiBase = "https://api.github.com/repos/" + owner + "/" + repoName + "/contents/" + path;
    const res = await fetch(apiBase + "?ref=" + encodeURIComponent(branch), { headers });
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error("Could not read " + path + " from GitHub (HTTP " + res.status + ")");
    const data = await res.json();
    return data.sha || null;
  }

  // ---- Image upload: { password, image: { filename, data } } ----
  // data is the file as a base64 string. Stored under
  // assets/uploads/ with an SEO-friendly file name; the admin
  // puts the returned path into the image field.
  if (body.image !== undefined) {
    const err = validateImageUpload(body.image);
    if (err) return json(400, { error: err });
    try {
      const name = safeImageName(body.image.filename);
      const path = IMAGE_UPLOAD_DIR + name;
      const sha = await getSha(path);
      await writeBinary(path, sha, body.image.data, "Upload image " + name + " via admin");
      return json(200, { ok: true, path: "/" + path, message: "Image uploaded: /" + path });
    } catch (e) {
      return json(502, { error: e.message });
    }
  }

  // ---- Site settings save: { password, settings } ----
  if (body.settings !== undefined) {
    const err = validateSettings(body.settings);
    if (err) return json(400, { error: err });
    try {
      const current = await readFile("site-settings.json");
      const base = current.data && typeof current.data === "object" ? current.data : {};
      const merged = { ...base, ...normaliseSettings(body.settings) };
      await writeFile("site-settings.json", current.sha, merged, "Update site settings via admin");
      return json(200, { ok: true, message: "Site settings saved. The live site picks them up on its next load." });
    } catch (e) {
      return json(502, { error: e.message });
    }
  }

  // ---- Video publish / delete: { password, video, _delete? } ----
  const isDelete = body._delete === true;
  const video = body.video;
  if (!video || typeof video.id !== "number") return json(400, { error: "video.id is required" });

  let cleaned = null;
  if (!isDelete) {
    const err = validateVideo(video);
    if (err) return json(400, { error: err });
    cleaned = normalise(video);
  }

  try {
    const current = await readFile("videos.json");
    let videos = [];
    if (current.data !== null) videos = Array.isArray(current.data) ? current.data : (current.data.videos || []);
    if (isDelete) {
      const before = videos.length;
      videos = videos.filter((v) => v.id !== video.id);
      if (videos.length === before) return json(404, { error: "Video #" + video.id + " not found" });
      await writeFile("videos.json", current.sha, videos, "Delete video #" + video.id + " via admin");
      return json(200, { ok: true, message: "Video #" + video.id + " deleted. " + videos.length + " videos remain.", total: videos.length });
    }
    const clash = videos.find((x) => x.slug === cleaned.slug && x.id !== cleaned.id);
    if (clash) return json(400, { error: "slug '" + cleaned.slug + "' is already used by video #" + clash.id + " — pick a different slug" });
    // No thumbnail on a published video: auto-generate an SVG one
    // (category gradient + title) so the card never renders empty.
    let generatedThumbnail = null;
    let thumbnailWarning = null;
    if (cleaned.status !== "draft" && !cleaned.thumbnail) {
      const thumbPath = "assets/uploads/" + cleaned.slug + "-thumb.svg";
      try {
        const sha = await getSha(thumbPath);
        await writeBinary(thumbPath, sha, b64encode(buildThumbSvg(cleaned.title, cleaned.category)), "Auto-generate thumbnail for video #" + cleaned.id + " via admin");
        cleaned.thumbnail = "/" + thumbPath;
        generatedThumbnail = cleaned.thumbnail;
      } catch (e) {
        thumbnailWarning = "Thumbnail could not be auto-generated: " + e.message;
      }
    }
    const idx = videos.findIndex((v) => v.id === cleaned.id);
    if (idx >= 0) videos[idx] = cleaned;
    else videos.push(cleaned);
    videos.sort((a, b) => a.id - b.id);
    await writeFile("videos.json", current.sha, videos, "Publish video #" + cleaned.id + " via admin: " + cleaned.title);
    let msg = "Video #" + cleaned.id + " published. " + videos.length + " videos in total.";
    if (generatedThumbnail) msg += " Thumbnail auto-generated: " + generatedThumbnail;
    if (thumbnailWarning) msg += " " + thumbnailWarning;
    return json(200, { ok: true, message: msg, total: videos.length, ...(generatedThumbnail ? { generatedThumbnail } : {}), ...(thumbnailWarning ? { thumbnailWarning } : {}) });
  } catch (e) {
    return json(502, { error: e.message });
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json(405, { error: "Use POST with {password, video}, {password, settings} or {password, image}." });
}
