/* VidTheme — clean-URL router + server-side meta tags (Cloudflare Pages Function).
 *
 * Serves index.html for every page the front-end app renders
 * (homepage, /page/NN.html, /video/<slug>-<id>.html,
 * /tags/<slug>.html, /search, /terms, /privacy, /contact, /dmca)
 * so a direct visit or refresh on a clean URL works.
 *
 * Server-side meta: view-source and crawlers see the real per-page
 * meta tags, not just the generic shell head. For a video page the
 * function loads videos.json, finds the video and rewrites the
 * <head> block (title, keywords, description, canonical, Open Graph
 * incl. og:video, Twitter Card, VideoObject JSON-LD) before serving.
 * Tag, pagination and search pages get their own meta the same way.
 * The client-side setMeta() in app.js still runs afterwards and
 * upserts the same values, so nothing changes in the browser.
 *
 * Passes through untouched: /api/*, /admin.html, /videos.json,
 * /assets/* and any other real file. Unknown video ids and drafts
 * get a real 404; anything else unknown gets a real 404 too. */

const SITE_URL = "https://vidtehemsite.pages.dev";
const HOME_TITLE = "VidTheme: Free HD Videos by Category";
const HOME_DESC =
  "VidTheme — browse free videos by category. Nature, Travel, Food, Ocean Life, Mountains, City Life, Winter and Sky videos, all in one place.";
const HOME_KEYWORDS =
  "vidtheme, nature videos, travel videos, food videos, ocean life videos, mountain videos, city life videos, winter videos, sky videos, free videos";
const HOME_OG_IMAGE = SITE_URL + "/assets/og-image.svg";
const TAGS = ["Nature", "Travel", "Food", "Ocean Life", "Mountains", "City Life", "Winter", "Sky"];

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function absUrl(u) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === "/") return SITE_URL + u;
  return SITE_URL + "/" + u;
}
function durationSeconds(d) {
  if (!d) return 0;
  var p = String(d).split(":");
  if (p.length !== 2) return 0;
  var m = parseInt(p[0], 10), s = parseInt(p[1], 10);
  if (isNaN(m) || isNaN(s)) return 0;
  return m * 60 + s;
}
function isoDuration(d) {
  var total = durationSeconds(d);
  return "PT" + Math.floor(total / 60) + "M" + (total % 60) + "S";
}

/* Build the <head> meta block (title through Twitter tags, plus an
   optional VideoObject JSON-LD). Mirrors the client-side setMeta()
   in assets/app.js, so server and browser always agree. */
function headBlock(o) {
  var lines = [];
  lines.push('    <title>' + esc(o.title) + '</title>');
  lines.push('    <meta name="Keywords" content="' + esc(o.keywords) + '" />');
  lines.push('    <meta name="description" content="' + esc(o.description) + '" />');
  lines.push('    <link rel="canonical" href="' + esc(o.canonical) + '" />');
  lines.push('    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />');
  lines.push('    <link rel="apple-touch-icon" href="/assets/favicon.svg" />');
  lines.push('    <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon.svg" />');
  lines.push('    <meta property="og:title" content="' + esc(o.ogTitle || o.title) + '" />');
  lines.push('    <meta property="og:description" content="' + esc(o.ogDescription || o.description) + '" />');
  lines.push('    <meta property="og:image" content="' + esc(o.ogImage || HOME_OG_IMAGE) + '" />');
  lines.push('    <meta property="og:type" content="' + esc(o.ogType || "website") + '" />');
  lines.push('    <meta property="og:url" content="' + esc(o.canonical) + '" />');
  if (o.ogVideo) {
    lines.push('    <meta property="og:video:type" content="text/html" />');
    lines.push('    <meta property="og:video:width" content="1280" />');
    lines.push('    <meta property="og:video:height" content="720" />');
    if (o.ogVideo.duration) {
      lines.push('    <meta property="og:video:duration" content="' + o.ogVideo.duration + '" />');
    }
  }
  lines.push('    <meta name="twitter:card" content="' + esc(o.twitterCard || "summary_large_image") + '" />');
  lines.push('    <meta name="twitter:title" content="' + esc(o.twitterTitle || o.ogTitle || o.title) + '" />');
  lines.push('    <meta name="twitter:description" content="' + esc(o.twitterDescription || o.ogDescription || o.description) + '" />');
  lines.push('    <meta name="twitter:image" content="' + esc(o.twitterImage || o.ogImage || HOME_OG_IMAGE) + '" />');
  if (o.jsonLd) {
    var json = JSON.stringify(o.jsonLd).replace(/</g, "\\u003c");
    lines.push('    <script type="application/ld+json" id="vt-ld">' + json + '</script>');
  }
  return lines.join("\n");
}

/* Replace the static head block (from <title> up to <style>) in the
   served HTML with the generated per-page block. */
function injectMeta(html, o) {
  var out = html.replace(/<title>[\s\S]*?(?=<style>)/, headBlock(o) + "\n");
  if (o.robots) {
    out = out.replace(
      '<meta name="robots" content="index, follow" />',
      '<meta name="robots" content="' + esc(o.robots) + '" />'
    );
    out = out.replace(
      '<meta name="googlebot" content="index, follow" />',
      '<meta name="googlebot" content="' + esc(o.robots) + '" />'
    );
  }
  return out;
}

function videoMeta(v) {
  var vTitle = v.seo_title || v.title || "Untitled video";
  var tags = v.tags && v.tags.length ? v.tags : v.category ? [v.category] : [];
  var cat = (v.category || tags[0] || "video").toLowerCase();
  var vDesc =
    v.meta_description || "Watch " + v.title + " on VidTheme — free " + cat + " video.";
  var vKw = v.meta_keywords || tags.join(", ");
  var vCanon = v.canonical || SITE_URL + "/video/" + (v.slug || "video") + "-" + v.id + ".html";
  var vOgImg = absUrl(v.og_image || v.thumbnail || v.thumb || "/assets/og-image.svg");
  return {
    title: vTitle + " | VidTheme",
    description: vDesc,
    keywords: vKw,
    canonical: vCanon,
    ogType: "video.movie",
    ogTitle: v.og_title || vTitle + " | VidTheme",
    ogDescription: v.og_description || vDesc,
    ogImage: vOgImg,
    ogVideo: { duration: durationSeconds(v.duration) },
    twitterCard: v.twitter_card === "summary" ? "summary" : "summary_large_image",
    twitterImage: vOgImg,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: v.title,
      description: vDesc,
      thumbnailUrl: vOgImg,
      uploadDate: v.date || "",
      duration: isoDuration(v.duration),
      embedUrl: v.embed_url || "",
      contentUrl: vCanon,
    },
  };
}

function tagMeta(tag, page) {
  return {
    title: tag + " Videos | VidTheme",
    description: "Watch free " + tag.toLowerCase() + " videos on VidTheme.",
    keywords: tag.toLowerCase() + " videos, " + HOME_KEYWORDS,
    canonical: SITE_URL + "/tags/" + slugify(tag) + ".html" + (page > 1 ? "?p=" + page : ""),
    ogType: "website",
  };
}

function pageMeta(n) {
  return {
    title: "Latest Videos — Page " + n + " | VidTheme",
    description: HOME_DESC,
    keywords: HOME_KEYWORDS,
    canonical: SITE_URL + "/page/" + String(n).padStart(2, "0") + ".html",
    ogType: "website",
  };
}

function searchMeta(q) {
  return {
    title: "Search: " + q + " — VidTheme",
    description: 'Search results for "' + q + '" on VidTheme.',
    keywords: q + ", " + HOME_KEYWORDS,
    canonical: SITE_URL + "/search?q=" + encodeURIComponent(q),
    robots: "noindex, follow",
    ogType: "website",
  };
}

function notFoundHtml() {
  return (
    '<!doctype html><title>404 — VidTheme</title><body style="font-family:Arial,sans-serif;background:#e9e9e9;text-align:center;padding:60px 16px">' +
    "<h1>404 — Page not found</h1><p>This page does not exist on VidTheme.</p>" +
    '<p><a href="/">Back to the homepage</a></p></body>'
  );
}

async function loadVideos(context, url) {
  try {
    const r = await context.env.ASSETS.fetch(new URL("/videos.json", url));
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : data.videos || [];
  } catch (e) {
    return [];
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // API and real files pass through to Pages / the next handler.
  if (
    path.startsWith("/api/") ||
    path === "/admin.html" ||
    path === "/videos.json" ||
    path === "/index.html" ||
    path === "/favicon.ico" ||
    path.startsWith("/assets/")
  ) {
    return context.next();
  }

  // Short admin URL: /admin serves the dashboard (admin.html).
  if (path === "/admin") {
    const res = await context.env.ASSETS.fetch(new URL("/admin.html", url));
    return new Response(res.body, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  const videoMatch = /^\/video\/.+-(\d+)\.html$/.exec(path);
  const pageMatch = /^\/page\/(\d+)\.html$/.exec(path);
  const tagMatch = /^\/tags\/([a-z0-9-]+)\.html$/.exec(path);
  const isPage =
    path === "/" ||
    !!pageMatch ||
    !!videoMatch ||
    !!tagMatch ||
    path === "/search" ||
    /^\/(terms|privacy|contact|dmca)$/.test(path);

  if (!isPage) {
    return new Response(notFoundHtml(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const res = await context.env.ASSETS.fetch(new URL("/index.html", url));
  let html = await res.text();

  // Video page: inject the per-video meta; unknown id or draft = 404.
  if (videoMatch) {
    const id = parseInt(videoMatch[1], 10);
    const list = await loadVideos(context, url);
    let video = null;
    for (const v of list) {
      if (v.id === id) {
        video = v;
        break;
      }
    }
    if (!video || video.status === "draft") {
      return new Response(notFoundHtml(), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    html = injectMeta(html, videoMeta(video));
  } else if (tagMatch) {
    const tag = TAGS.find((t) => slugify(t) === tagMatch[1]);
    if (tag) {
      const p = parseInt(url.searchParams.get("p") || "1", 10) || 1;
      html = injectMeta(html, tagMeta(tag, p));
    }
  } else if (pageMatch) {
    const n = parseInt(pageMatch[1], 10) || 1;
    if (n > 1) html = injectMeta(html, pageMeta(n));
  } else if (path === "/search") {
    const q = url.searchParams.get("q") || "";
    if (q) html = injectMeta(html, searchMeta(q));
  }

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
