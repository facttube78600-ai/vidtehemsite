/* VidTheme — Publish API (Cloudflare Pages Function).
 *
 * POST /api/publish  { password, video, _delete? }
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
 * Flow: check password -> fetch current videos.json from GitHub
 * -> upsert (or delete) the video -> commit the updated file
 * back via the GitHub Contents API -> the public site fetches the
 * new videos.json on its next load, with no redeploy. */

const TAGS = ["Nature", "Travel", "Food", "Ocean Life", "Mountains", "City Life", "Winter", "Sky"];
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
  if (v.duration && !/^\d{1,3}:\d{2}$/.test(v.duration)) return "video.duration must look like mm:ss";
  if (v.thumbnail && typeof v.thumbnail !== "string") return "video.thumbnail is invalid";
  if (v.thumbnail && v.thumbnail.length > 500) return "video.thumbnail is too long";
  const tags = Array.isArray(v.tags) ? v.tags : (v.category ? [v.category] : []);
  if (!tags.length) return "at least one category is required";
  for (const t of tags) if (!TAGS.includes(t)) return "unknown category: " + t;
  if (v.date && !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return "video.date must be YYYY-MM-DD";
  if (v.status !== undefined && v.status !== "published" && v.status !== "draft") return "video.status must be published or draft";
  if (v.seo_title !== undefined && (typeof v.seo_title !== "string" || v.seo_title.length > 70 || /[<>]/.test(v.seo_title))) return "video.seo_title is invalid (max 70 chars, no < >)";
  if (v.meta_description !== undefined && (typeof v.meta_description !== "string" || v.meta_description.length > 180 || /[<>]/.test(v.meta_description))) return "video.meta_description is invalid (max 180 chars, no < >)";
  if (v.meta_keywords !== undefined && (typeof v.meta_keywords !== "string" || v.meta_keywords.length > 500 || /[<>]/.test(v.meta_keywords))) return "video.meta_keywords is invalid (max 500 chars, no < >)";
  if (v.focus_keyword !== undefined && (typeof v.focus_keyword !== "string" || v.focus_keyword.length > 100 || /[<>]/.test(v.focus_keyword))) return "video.focus_keyword is invalid (max 100 chars, no < >)";
  return null;
}

function normalise(v) {
  const tags = Array.isArray(v.tags) ? v.tags : (v.category ? [v.category] : []);
  return {
    id: v.id,
    slug: v.slug || slugify(v.title),
    title: v.title.trim(),
    duration: v.duration || "",
    thumbnail: v.thumbnail || "",
    embed_url: v.embed_url,
    tags,
    category: v.category || tags[0] || "",
    date: v.date || new Date().toISOString().slice(0, 10),
    status: v.status === "draft" ? "draft" : "published",
    seo_title: (v.seo_title || "").trim(),
    meta_description: (v.meta_description || "").trim(),
    meta_keywords: (v.meta_keywords || "").trim(),
    focus_keyword: (v.focus_keyword || "").trim(),
  };
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

  const isDelete = body._delete === true;
  const video = body.video;
  if (!video || typeof video.id !== "number") return json(400, { error: "video.id is required" });

  let cleaned = null;
  if (!isDelete) {
    const err = validateVideo(video);
    if (err) return json(400, { error: err });
    cleaned = normalise(video);
  }

  const apiBase = "https://api.github.com/repos/" + owner + "/" + repoName + "/contents/videos.json";
  const headers = {
    Authorization: "Bearer " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "VidTheme-Publish",
  };

  // Fetch the current videos.json (404 = start from an empty list).
  let sha = null;
  let videos = [];
  const current = await fetch(apiBase + "?ref=" + encodeURIComponent(branch), { headers });
  if (current.status === 200) {
    const data = await current.json();
    sha = data.sha;
    try {
      const parsed = JSON.parse(b64decode(data.content));
      videos = Array.isArray(parsed) ? parsed : (parsed.videos || []);
    } catch {
      return json(500, { error: "Current videos.json on GitHub is not valid JSON" });
    }
  } else if (current.status !== 404) {
    return json(502, { error: "Could not read videos.json from GitHub (HTTP " + current.status + ")" });
  }

  if (isDelete) {
    const before = videos.length;
    videos = videos.filter((v) => v.id !== video.id);
    if (videos.length === before) return json(404, { error: "Video #" + video.id + " not found" });
  } else {
    const idx = videos.findIndex((v) => v.id === cleaned.id);
    if (idx >= 0) videos[idx] = cleaned;
    else videos.push(cleaned);
    videos.sort((a, b) => a.id - b.id);
  }

  const content = b64encode(JSON.stringify(videos, null, 2) + "\n");
  const put = await fetch(apiBase, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: isDelete
        ? "Delete video #" + video.id + " via admin"
        : "Publish video #" + cleaned.id + " via admin: " + cleaned.title,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!put.ok) {
    const detail = await put.text();
    return json(502, { error: "GitHub commit failed (HTTP " + put.status + ")", detail: detail.slice(0, 300) });
  }

  return json(200, {
    ok: true,
    message: isDelete
      ? "Video #" + video.id + " deleted. " + videos.length + " videos remain."
      : "Video #" + cleaned.id + " published. " + videos.length + " videos in total.",
    total: videos.length,
  });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json(405, { error: "Use POST with {password, video}." });
}
