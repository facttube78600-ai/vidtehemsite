/* VidTheme — clean-URL router + server-side meta tags (Cloudflare Pages Function).
 *
 * Serves index.html for every page the front-end app renders
 * (homepage, /page/NN.html, /<category>/<slug>-<id>.html,
 * /tags/<slug>.html, /search, /terms, /privacy, /contact, /dmca)
 * so a direct visit or refresh on a clean URL works.
 *
 * Server-side meta: view-source and crawlers see the real per-page
 * meta tags, not just the generic shell head. The site-wide meta
 * (title, description, keywords, OG image, Twitter card) comes
 * from site-settings.json, managed in the admin dashboard
 * (Site > Site Meta); the header code from the same file
 * (Analytics, Search Console, …) is injected into <head> of
 * every page — it is always on and independent of the Ads
 * switches. For a video page the function loads videos.json,
 * finds the video and rewrites the <head> block (title, keywords,
 * description, canonical, Open Graph incl. og:video, Twitter
 * Card, VideoObject JSON-LD) before serving. Tag, pagination
 * and search pages get their own meta the same way.
 * The client-side setMeta() in app.js still runs afterwards and
 * upserts the same values, so nothing changes in the browser.
 *
 * Legacy video URLs /video/<slug>-<id>.html 301-redirect to the
 * category URL /<category>/<slug>-<id>.html.
 *
 * Passes through untouched: /api/*, /admin.html, /videos.json,
 * /site-settings.json, /assets/* and any other real file.
 * Unknown video ids and drafts get a real 404; anything else
 * unknown gets a real 404 too. */

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
function isCategorySlug(slug) {
  return TAGS.some((t) => slugify(t) === slug);
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
  if (p.length === 2) {
    var m = parseInt(p[0], 10), s = parseInt(p[1], 10);
    if (isNaN(m) || isNaN(s)) return 0;
    return m * 60 + s;
  }
  if (p.length === 3) {
    var h = parseInt(p[0], 10), m2 = parseInt(p[1], 10), s2 = parseInt(p[2], 10);
    if (isNaN(h) || isNaN(m2) || isNaN(s2)) return 0;
    return h * 3600 + m2 * 60 + s2;
  }
  return 0;
}
function isoDuration(d) {
  var total = durationSeconds(d);
  var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return "PT" + (h ? h + "H" : "") + m + "M" + s + "S";
}

/* Site-wide values from site-settings.json, with the built-in
   defaults when a setting is missing. */
function siteMeta(settings) {
  return {
    title: (settings && settings.siteTitle) || HOME_TITLE,
    description: (settings && settings.siteDescription) || HOME_DESC,
    keywords: (settings && settings.siteKeywords) || HOME_KEYWORDS,
    ogImage: absUrl((settings && settings.ogImage) || HOME_OG_IMAGE),
    ogImageAlt: (settings && settings.ogImageAlt) || "",
    twitterCard: (settings && settings.twitterCard) || "summary_large_image",
    headerCode: (settings && settings.headerCode) || "",
  };
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
  lines.push('    <meta property="og:image:alt" content="' + esc(o.ogImageAlt || "VidTheme — free videos by category") + '" />');
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

/* Header code (Analytics, Search Console, …) is always on: it is
   injected into <head> of every served page, wrapped in markers
   so the client-side fallback can tell it is already there. */
function injectHeader(html, code) {
  if (!code) return html;
  return html.replace(
    "</head>",
    "<!-- vt-header-code-start -->" + code + "<!-- vt-header-code-end -->\n</head>"
  );
}

function videoUrl(v) {
  var cat = slugify(v.category || (v.tags && v.tags[0]) || "video");
  return "/" + cat + "/" + (v.slug || "video") + "-" + v.id + ".html";
}

function videoMeta(v, site) {
  var vTitle = v.seo_title || v.title || "Untitled video";
  var tags = v.tags && v.tags.length ? v.tags : v.category ? [v.category] : [];
  var cat = (v.category || tags[0] || "video").toLowerCase();
  var vDesc =
    v.meta_description || "Watch " + v.title + " on VidTheme — free " + cat + " video.";
  var vKw = v.meta_keywords || tags.join(", ");
  var vCanon = v.canonical || SITE_URL + videoUrl(v);
  var vOgImg = absUrl(v.og_image || v.thumbnail || v.thumb || site.ogImage);
  return {
    title: vTitle + " | VidTheme",
    description: vDesc,
    keywords: vKw,
    canonical: vCanon,
    ogType: "video.movie",
    ogTitle: v.og_title || vTitle + " | VidTheme",
    ogDescription: v.og_description || vDesc,
    ogImage: vOgImg,
    ogImageAlt: v.og_image_alt || v.thumb_alt || v.title,
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

function homeMeta(site) {
  return {
    title: site.title,
    description: site.description,
    keywords: site.keywords,
    canonical: SITE_URL + "/",
    ogType: "website",
    ogImage: site.ogImage,
    ogImageAlt: site.ogImageAlt,
    twitterCard: site.twitterCard,
  };
}

function tagMeta(tag, page, site) {
  return {
    title: tag + " Videos | VidTheme",
    description: "Watch free " + tag.toLowerCase() + " videos on VidTheme.",
    keywords: tag.toLowerCase() + " videos, " + site.keywords,
    canonical: SITE_URL + "/tags/" + slugify(tag) + ".html" + (page > 1 ? "?p=" + page : ""),
    ogType: "website",
    ogImage: site.ogImage,
    ogImageAlt: site.ogImageAlt,
    twitterCard: site.twitterCard,
  };
}

function pageMeta(n, site) {
  return {
    title: "Latest Videos — Page " + n + " | VidTheme",
    description: site.description,
    keywords: site.keywords,
    canonical: SITE_URL + "/page/" + String(n).padStart(2, "0") + ".html",
    ogType: "website",
    ogImage: site.ogImage,
    ogImageAlt: site.ogImageAlt,
    twitterCard: site.twitterCard,
  };
}

function searchMeta(q, site) {
  return {
    title: "Search: " + q + " — VidTheme",
    description: 'Search results for "' + q + '" on VidTheme.',
    keywords: q + ", " + site.keywords,
    canonical: SITE_URL + "/search?q=" + encodeURIComponent(q),
    robots: "noindex, follow",
    ogType: "website",
    ogImage: site.ogImage,
    ogImageAlt: site.ogImageAlt,
    twitterCard: site.twitterCard,
  };
}

function notFoundHtml() {
  return (
    '<!doctype html><title>404 — VidTheme</title><body style="font-family:Arial,sans-serif;background:#e9e9e9;text-align:center;padding:60px 16px">' +
    "<h1>404 — Page not found</h1><p>This page does not exist on VidTheme.</p>" +
    '<p><a href="/">Back to the homepage</a></p></body>'
  );
}

async function loadJsonAsset(context, url, name) {
  try {
    const r = await context.env.ASSETS.fetch(new URL("/" + name, url));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
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
    path === "/site-settings.json" ||
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

  const legacyVideoMatch = /^\/video\/.+-(\d+)\.html$/.exec(path);
  const videoMatch = /^\/([a-z0-9-]+)\/(.+)-(\d+)\.html$/.exec(path);
  const isVideo = !!legacyVideoMatch || (!!videoMatch && isCategorySlug(videoMatch[1]));
  const pageMatch = /^\/page\/(\d+)\.html$/.exec(path);
  const tagMatch = /^\/tags\/([a-z0-9-]+)\.html$/.exec(path);
  const isPage =
    path === "/" ||
    !!pageMatch ||
    isVideo ||
    !!tagMatch ||
    path === "/search" ||
    /^\/(terms|privacy|contact|dmca)$/.test(path);

  if (!isPage) {
    return new Response(notFoundHtml(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const settings = await loadJsonAsset(context, url, "site-settings.json");
  const site = siteMeta(settings);

  // Legacy video URL: 301 to the category URL.
  if (legacyVideoMatch) {
    const id = parseInt(legacyVideoMatch[1], 10);
    const list = await loadJsonAsset(context, url, "videos.json");
    const arr = Array.isArray(list) ? list : (list && list.videos) || [];
    let video = null;
    for (const v of arr) {
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
    return Response.redirect(SITE_URL + videoUrl(video), 301);
  }

  const res = await context.env.ASSETS.fetch(new URL("/index.html", url));
  let html = await res.text();

  // Video page: inject the per-video meta; unknown id or draft = 404.
  if (videoMatch) {
    const id = parseInt(videoMatch[3], 10);
    const list = await loadJsonAsset(context, url, "videos.json");
    const arr = Array.isArray(list) ? list : (list && list.videos) || [];
    let video = null;
    for (const v of arr) {
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
    html = injectMeta(html, videoMeta(video, site));
  } else if (tagMatch) {
    const tag = TAGS.find((t) => slugify(t) === tagMatch[1]);
    if (tag) {
      const p = parseInt(url.searchParams.get("p") || "1", 10) || 1;
      html = injectMeta(html, tagMeta(tag, p, site));
    }
  } else if (pageMatch) {
    const n = parseInt(pageMatch[1], 10) || 1;
    if (n > 1) html = injectMeta(html, pageMeta(n, site));
    else html = injectMeta(html, homeMeta(site));
  } else if (path === "/search") {
    const q = url.searchParams.get("q") || "";
    if (q) html = injectMeta(html, searchMeta(q, site));
    else html = injectMeta(html, homeMeta(site));
  } else {
    html = injectMeta(html, homeMeta(site));
  }

  html = injectHeader(html, site.headerCode);

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
