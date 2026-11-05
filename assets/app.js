/* VidTheme — front-end app.
   Styling is the reference CSS, used verbatim in index.html
   (Verdana, #D0D3D4 page, fixed #212121 navbar, .thumbnail 1188px,
   float-based .thumb cards, Bootstrap-style pagination, .toptitle,
   .tags/.tagsstyle, .related, .player embed structure).
   Videos are NOT embedded in this file. They are fetched from
   videos.json on GitHub raw on every load (cache-buster), with a
   fallback to the local videos.json, so a new video published via
   the admin appears without a Pages redeploy.
   Clean URLs via the History API:
     /                              homepage
     /page/02.html                  homepage, page 2
     /<category>/<slug>-<id>.html   video page (category drives the URL)
     /video/<slug>-<id>.html        legacy video URL (server redirects)
     /tags/<slug>.html              tag page (?p=2 for page 2)
     /search?q=<query>              search results (?p=2 ...)
     /terms, /privacy, /contact, /dmca
   Site settings (site meta, header code, ads, brand row) live in
   site-settings.json, fetched the same way as videos.json, so a
   dashboard change appears without a redeploy. Header code is
   injected into <head> on every page (server-side by the Pages
   Function, with this file as a fallback for SPA loads).
   The Pages Function functions/[[path]].js serves index.html for
   these paths, so a direct visit / refresh works too. */
(function () {
  "use strict";

  var GITHUB_RAW_URL =
    "https://raw.githubusercontent.com/facttube78600-ai/vidtehemsite/main/videos.json";
  var SETTINGS_RAW_URL =
    "https://raw.githubusercontent.com/facttube78600-ai/vidtehemsite/main/site-settings.json";
  var PER_PAGE = 48;

  var TAGS = [
    "Nature",
    "Travel",
    "Food",
    "Ocean Life",
    "Mountains",
    "City Life",
    "Winter",
    "Sky"
  ];

  var VIDEOS = [];
  var app = document.getElementById("app");
  var brandRow = document.getElementById("brandRow");
  var searchForm = document.getElementById("searchForm");
  var searchInput = document.getElementById("searchInput");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function tagSlug(tag) { return slugify(tag); }

  function findTag(slug) {
    for (var i = 0; i < TAGS.length; i++) {
      if (tagSlug(TAGS[i]) === slug) return TAGS[i];
    }
    return null;
  }

  function categorySlug(v) {
    return slugify(v.category || (v.tags && v.tags[0]) || "video");
  }
  function videoUrl(v) { return "/" + categorySlug(v) + "/" + v.slug + ".html"; }
  function tagUrl(tag) { return "/tags/" + tagSlug(tag) + ".html"; }

  /* ---------- Professional meta tags (per route) ----------
     Structure only, modelled on a professional video site's head:
     title, keywords, description, canonical, robots, Open Graph
     (incl. og:video for video pages) and Twitter Card, plus a
     VideoObject JSON-LD on video pages. All values come from our
     own videos/categories — nothing is copied from any other site. */
  var SITE_URL = "https://vidtehemsite.pages.dev";
  var HOME_TITLE = "VidTheme: Free HD Videos by Category";
  var HOME_DESC = "VidTheme — browse free videos by category. Nature, Travel, Food, Ocean Life, Mountains, City Life, Winter and Sky videos, all in one place.";
  var HOME_KEYWORDS = "vidtheme, nature videos, travel videos, food videos, ocean life videos, mountain videos, city life videos, winter videos, sky videos, free videos";
  var HOME_OG_IMAGE = SITE_URL + "/assets/og-image.svg";
  var HOME_OG_IMAGE_ALT = "VidTheme — free videos by category";

  /* ---------- Site settings (site-settings.json) ----------
     Same fetch pattern as videos.json: GitHub raw first (fresh
     after a dashboard save), local copy as fallback. Settings
     never block the page: a failed load keeps the built-in
     defaults above. */
  var SETTINGS = null;
  function loadSettings() {
    var bust = "?v=" + Date.now();
    return fetch(SETTINGS_RAW_URL + bust, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("settings raw " + r.status); return r.json(); })
      .catch(function () {
        return fetch("/site-settings.json" + bust, { cache: "no-store" }).then(function (r) {
          if (!r.ok) throw new Error("local settings " + r.status);
          return r.json();
        });
      })
      .then(function (s) { SETTINGS = s || null; })
      .catch(function () { SETTINGS = null; });
  }
  function applySettings() {
    if (!SETTINGS) return;
    if (SETTINGS.siteTitle) HOME_TITLE = SETTINGS.siteTitle;
    if (SETTINGS.siteDescription) HOME_DESC = SETTINGS.siteDescription;
    if (SETTINGS.siteKeywords) HOME_KEYWORDS = SETTINGS.siteKeywords;
    if (SETTINGS.ogImage) HOME_OG_IMAGE = absUrl(SETTINGS.ogImage);
    if (SETTINGS.ogImageAlt) HOME_OG_IMAGE_ALT = SETTINGS.ogImageAlt;
    renderBrands();
    applyHeaderCode();
  }
  /* Inject an HTML/JS snippet (header code, ad code) through real
     DOM nodes so <script> tags actually execute. Scripts set
     through innerHTML never run, and scripts parsed by innerHTML
     do not reliably run when moved afterwards — so each <script>
     is re-created with createElement (attributes + text copied)
     and appended; other nodes are appended as-is. */
  function injectCodeInto(el, code) {
    var tmp = document.createElement("div");
    tmp.innerHTML = code;
    var nodes = [];
    while (tmp.firstChild) nodes.push(tmp.removeChild(tmp.firstChild));
    nodes.forEach(function (n) {
      if (n.tagName && n.tagName.toLowerCase() === "script") {
        var s = document.createElement("script");
        for (var i = 0; i < n.attributes.length; i++) {
          var at = n.attributes[i];
          s.setAttribute(at.name, at.value);
        }
        s.text = n.textContent;
        el.appendChild(s);
      } else {
        el.appendChild(n);
      }
    });
  }
  /* Header code (Analytics, Search Console, …) is injected into
     <head> on every page. The Pages Function normally injects it
     server-side with vt-header-code markers; this is the fallback
     for loads where it is missing. */
  function applyHeaderCode() {
    if (!SETTINGS || !SETTINGS.headerCode) return;
    if (document.head.innerHTML.indexOf("vt-header-code-start") !== -1) return;
    document.head.appendChild(document.createComment(" vt-header-code-start "));
    injectCodeInto(document.head, SETTINGS.headerCode);
    document.head.appendChild(document.createComment(" vt-header-code-end "));
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
  function upsertMeta(attr, key, content) {
    var el = document.querySelector(attr === "name" ? 'meta[name="' + key + '"]' : 'meta[property="' + key + '"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content == null ? "" : content);
  }
  function upsertLink(rel, href) {
    var el = document.querySelector('link[rel="' + rel + '"]');
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  }
  function setJsonLd(obj) {
    var old = document.getElementById("vt-ld");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!obj) return;
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "vt-ld";
    s.text = JSON.stringify(obj);
    document.head.appendChild(s);
  }
  function setMeta(o) {
    document.title = o.title || HOME_TITLE;
    upsertMeta("name", "description", o.description || HOME_DESC);
    upsertMeta("name", "keywords", o.keywords || HOME_KEYWORDS);
    upsertMeta("name", "robots", o.robots || "index, follow");
    upsertMeta("name", "googlebot", o.robots || "index, follow");
    if (o.canonical) upsertLink("canonical", o.canonical);
    upsertMeta("property", "og:title", o.ogTitle || o.title || HOME_TITLE);
    upsertMeta("property", "og:description", o.ogDescription || o.description || HOME_DESC);
    upsertMeta("property", "og:image", o.ogImage || HOME_OG_IMAGE);
    upsertMeta("property", "og:image:alt", o.ogImageAlt || HOME_OG_IMAGE_ALT);
    upsertMeta("property", "og:type", o.ogType || "website");
    upsertMeta("property", "og:url", o.canonical || SITE_URL + "/");
    upsertMeta("name", "twitter:card", o.twitterCard || "summary_large_image");
    upsertMeta("name", "twitter:title", o.twitterTitle || o.ogTitle || o.title || HOME_TITLE);
    upsertMeta("name", "twitter:description", o.twitterDescription || o.ogDescription || o.description || HOME_DESC);
    upsertMeta("name", "twitter:image", o.twitterImage || o.ogImage || HOME_OG_IMAGE);
    ["og:video:type", "og:video:width", "og:video:height", "og:video:duration"].forEach(function (k) {
      var el = document.querySelector('meta[property="' + k + '"]');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    if (o.ogVideo) {
      upsertMeta("property", "og:video:type", o.ogVideo.type || "text/html");
      upsertMeta("property", "og:video:width", String(o.ogVideo.width || 1280));
      upsertMeta("property", "og:video:height", String(o.ogVideo.height || 720));
      if (o.ogVideo.duration) upsertMeta("property", "og:video:duration", String(o.ogVideo.duration));
    }
    setJsonLd(o.jsonLd || null);
  }

  /* Normalise one videos.json entry to the shape the views use. */
  function normalise(v) {
    var tags = v.tags && v.tags.length ? v.tags : (v.tag ? [v.tag] : (v.category ? [v.category] : []));
    return {
      id: v.id,
      slug: v.slug || slugify(v.title || ("video-" + v.id)),
      title: v.title || "Untitled video",
      duration: v.duration || "",
      thumb: v.thumbnail || v.thumb || "assets/thumbs/placeholder.svg",
      embed_url: v.embed_url || "",
      tags: tags,
      tag: v.category || tags[0] || "",
      category: v.category || tags[0] || "",
      date: v.date || "",
      status: v.status === "draft" ? "draft" : "published",
      seo_title: v.seo_title || "",
      meta_description: v.meta_description || "",
      meta_keywords: v.meta_keywords || "",
      focus_keyword: v.focus_keyword || "",
      og_title: v.og_title || "",
      og_description: v.og_description || "",
      og_image: v.og_image || "",
      thumb_alt: v.thumb_alt || "",
      og_image_alt: v.og_image_alt || "",
      twitter_card: v.twitter_card === "summary" ? "summary" : "summary_large_image",
      canonical: v.canonical || ""
    };
  }

  var ALL_VIDEOS = []; /* every video incl. drafts — only used to tell
                          "draft" apart from "does not exist" */
  function isPublished(v) { return v.status !== "draft"; }

  function loadVideos() {
    var bust = "?v=" + Date.now();
    return fetch(GITHUB_RAW_URL + bust, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("GitHub raw HTTP " + r.status);
        return r.json();
      })
      .catch(function () {
        /* Fallback is the copy deployed with the site. It must be an
           ABSOLUTE path: on a video/tag/page URL a relative
           "videos.json" would resolve to /video/videos.json (404),
           so a refresh on any deep link could never recover when the
           GitHub fetch failed — the page stayed empty. */
        return fetch("/videos.json" + bust, { cache: "no-store" }).then(function (r) {
          if (!r.ok) throw new Error("local videos.json HTTP " + r.status);
          return r.json();
        });
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data.videos || []);
        ALL_VIDEOS = list.map(normalise).sort(function (a, b) { return a.id - b.id; });
        /* Drafts never show publicly — only published videos (and
           entries with no status field, which count as published). */
        VIDEOS = ALL_VIDEOS.filter(isPublished);
      });
  }

  /* Channels row — one slot per category, managed in the admin
     dashboard (Site > Brand Row). A slot shows its image when one
     is set, otherwise the coloured text button (90x40, white bold
     uppercase). The link is configurable per slot. */
  var BRAND_COLORS = { Nature: "#24975c", Travel: "#3277d6", Food: "#d36e2e", "Ocean Life": "#1f9aa6", Mountains: "#6c5ca1", "City Life": "#3c4451", Winter: "#5e93b5", Sky: "#a13c8e" };
  function defaultBrands() {
    return TAGS.map(function (t) {
      return { label: t, color: BRAND_COLORS[t] || "#3c4451", image: "", link: tagUrl(t), enabled: true };
    });
  }
  function renderBrands() {
    var brands = (SETTINGS && Array.isArray(SETTINGS.brands) && SETTINGS.brands.length) ? SETTINGS.brands : defaultBrands();
    brandRow.innerHTML = brands.filter(function (b) { return b.enabled !== false; }).map(function (b) {
      var slug = tagSlug(b.label || "");
      var inner = b.image
        ? '<img src="' + esc(absUrl(b.image)) + '" width="90" height="40" alt="' + esc(b.alt || b.label) + '" />'
        : esc(String(b.label || "").toUpperCase());
      var cls = b.image ? "" : ' class="brand-' + slug + '"';
      return (
        '<div class="chan"><a' + cls + ' href="' + esc(b.link || tagUrl(b.label)) + '" data-tag="' + esc(b.label) + '" aria-label="' + esc(b.label) + '" title="' + esc(b.label) + '">' +
        inner +
        "</a></div>"
      );
    }).join("");
  }
  renderBrands();

  /* ---------- Ad slots (dashboard-managed) ----------
     Each placement is ON/OFF with pasted code in the admin (Site >
     Ads). OFF hides the slot entirely. ON with code renders the
     code; ON without code shows the placeholder. Ad code is
     activated through real DOM nodes after each render, because
     scripts set through innerHTML never execute. */
  var adSlotSeq = 0;
  var adRegistry = {};
  function adSlot(key, cls) {
    var a = SETTINGS && SETTINGS.ads ? SETTINGS.ads[key] : null;
    if (!a || !a.enabled) return "";
    if (!a.code) return '<div class="ad-slot ' + cls + '" role="complementary" aria-label="Advertisement slot">Advertisement</div>';
    var id = key + "-" + (++adSlotSeq);
    adRegistry[id] = a.code;
    return '<div class="ad-slot ' + cls + '" role="complementary" aria-label="Advertisement slot" data-adslot="' + id + '"></div>';
  }
  function adWide(key) { return adSlot(key, "wide"); }
  function adRect(key) { return adSlot(key, "rect"); }
  function activateAds() {
    var slots = document.querySelectorAll("[data-adslot]");
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i];
      var code = adRegistry[el.getAttribute("data-adslot")];
      if (!code) continue;
      injectCodeInto(el, code);
      el.removeAttribute("data-adslot");
    }
  }

  /* ---------- Lazy-load for thumb images (reference behaviour) ----------
     Before loading, an img has the placeholder src + data-lazy-src with
     the real thumb. When it comes within ~300px of the viewport
     (IntersectionObserver rootMargin), the real URL is swapped into src,
     class "lazyloaded" is added and data-was-processed="true" is set,
     then the image is unobserved. Without IntersectionObserver, all
     pending images load immediately. Called after every grid render. */
  var PLACEHOLDER_SRC =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAQAAACRI2S5AAAAEElEQVR42mNkIAAYRxWAAQAG9gAKqv6+AwAAAABJRU5ErkJggg==";

  function loadLazyImage(img) {
    var src = img.getAttribute("data-lazy-src");
    if (!src) return;
    img.setAttribute("src", src);
    if (img.classList && img.classList.add) img.classList.add("lazyloaded");
    else img.setAttribute("class", (img.getAttribute("class") || "") + " lazyloaded");
    img.setAttribute("data-was-processed", "true");
  }

  var lazyObserver = null;
  function observeLazyImages() {
    var imgs = document.querySelectorAll("img.img_prev[data-lazy-src]:not([data-was-processed])");
    var i;
    if (typeof IntersectionObserver === "undefined") {
      for (i = 0; i < imgs.length; i++) loadLazyImage(imgs[i]);
      return;
    }
    if (!lazyObserver) {
      lazyObserver = new IntersectionObserver(function (entries) {
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].isIntersecting) {
            loadLazyImage(entries[j].target);
            lazyObserver.unobserve(entries[j].target);
          }
        }
      }, { rootMargin: "300px 0px", threshold: 0 });
    }
    for (i = 0; i < imgs.length; i++) lazyObserver.observe(imgs[i]);
  }

  /* ---------- Cards & pagination (reference structure) ----------
     Card: <li class="thumb"><div class="thumb_wrap">
       <a class="thumb_link" href="/<category>/<slug>-<id>.html">
         <div class="thumb_img"><img class="img_prev" ...>
         <div class="timer">mm:ss</div></div></a>
       <div class="thumb_title">title</div></div></li>
     Only the image is clickable; the title strip sits OUTSIDE the link. */
  function cardHtml(v) {
    return (
      '<li class="thumb"><div class="thumb_wrap">' +
        '<a href="' + videoUrl(v) + '" class="thumb_link" title="' + esc(v.title) + '">' +
          '<div class="thumb_img">' +
            '<img class="img_prev" src="' + PLACEHOLDER_SRC + '" alt="' + esc(v.thumb_alt || v.title) + '" width="100%" height="auto" data-lazy-src="' + esc(absUrl(v.thumb)) + '" />' +
            '<div class="timer">' + esc(v.duration) + "</div>" +
          "</div>" +
        "</a>" +
        '<div class="thumb_title">' + esc(v.title) + "</div>" +
      "</div></li>"
    );
  }

  /* Page-number window, reference style (NO Prev/Next arrows):
       near the start  -> 1 2 3 4 5 6 7 . last
       near the end    -> 1 . last-6 . last
       in the middle   -> 1 . current-1 current current+1 . last
     The separator is a single "." (not an ellipsis). A gap of
     exactly one page is filled with that page number instead. */
  function pageList(current, total) {
    if (total <= 9) {
      var all = [];
      for (var i = 1; i <= total; i++) all.push(i);
      return all;
    }
    var wanted = {};
    function add(n) { if (n >= 1 && n <= total) wanted[n] = true; }
    var k;
    add(1); add(total);
    if (current <= 5) {
      for (k = 1; k <= 7; k++) add(k);
    } else if (current >= total - 4) {
      for (k = total - 6; k <= total; k++) add(k);
    } else {
      add(current - 1); add(current); add(current + 1);
    }
    var sorted = Object.keys(wanted).map(function (s) { return parseInt(s, 10); })
      .sort(function (a, b) { return a - b; });
    var out = [], prev = 0;
    sorted.forEach(function (n) {
      if (prev && n - prev === 2) out.push(prev + 1);
      else if (prev && n - prev > 2) out.push(".");
      out.push(n);
      prev = n;
    });
    return out;
  }

  /* Bootstrap-style pagination from the reference CSS:
     <div class="pager"><ul class="pagination">
       <li class="active"><a>1</a></li>
       <li><a href="/page/02.html">2</a></li> ...
       <li class="disabled"><a>.</a></li>
       <li><a href="/page/11.html">11</a></li></ul></div> */
  function paginationHtml(current, total, hrefFor) {
    if (total <= 1) return "";
    var html = '<div class="pager"><ul class="pagination" aria-label="Pages">';
    pageList(current, total).forEach(function (p) {
      if (p === ".") html += '<li class="disabled"><a>.</a></li>';
      else if (p === current) html += '<li class="active"><a>' + p + "</a></li>";
      else html += '<li><a href="' + hrefFor(p) + '" aria-label="Page ' + p + '">' + p + "</a></li>";
    });
    return html + "</ul></div>";
  }

  function gridPage(list, page) {
    var start = (page - 1) * PER_PAGE;
    return list.slice(start, start + PER_PAGE);
  }

  function totalPages(list) { return Math.max(1, Math.ceil(list.length / PER_PAGE)); }

  function clampPage(page, list) {
    var t = totalPages(list);
    if (isNaN(page) || page < 1) return 1;
    return Math.min(page, t);
  }

  /* .toptitle from the reference: homepage/tag/search titles are
     centred (inline style from the reference HTML); the video-page
     title is left-aligned with margin-top 5px. */
  function toptitle(text, center) {
    return '<div class="toptitle"' +
      (center ? ' style="text-align:center;margin:0px 5px 5px 5px;"' : ' style="margin-top:5px;"') +
      "><h1>" + esc(text) + "</h1></div>";
  }

  /* Reference homepage order: title, ad(100), pager, grid, pager,
     ad(250), ad(100). */
  function renderGridInto(list, page, hrefFor) {
    if (!list.length) return '<p class="empty-note">No videos found.</p>';
    var cards = gridPage(list, page).map(cardHtml).join("");
    return (
      adWide("homeTop") +
      paginationHtml(page, totalPages(list), hrefFor) +
      '<div class="thumbs"><ul>' + cards + "</ul></div>" +
      paginationHtml(page, totalPages(list), hrefFor) +
      adRect("homeBottomRect") +
      adWide("homeBottomWide")
    );
  }

  /* ---------- Views ---------- */
  function homeView(page) {
    var list = VIDEOS.slice().reverse(); /* newest first */
    page = clampPage(page, list);
    setMeta({
      title: page > 1 ? "Latest Videos — Page " + page + " | VidTheme" : HOME_TITLE,
      description: HOME_DESC,
      keywords: HOME_KEYWORDS,
      canonical: SITE_URL + (page > 1 ? "/page/" + String(page).padStart(2, "0") + ".html" : "/"),
      ogType: "website",
      ogImage: HOME_OG_IMAGE
    });
    app.innerHTML =
      toptitle("Latest Videos", true) +
      renderGridInto(list, page, function (p) { return p === 1 ? "/" : "/page/" + String(p).padStart(2, "0") + ".html"; });
    observeLazyImages();
  }

  function tagView(tag, page) {
    var list = VIDEOS.filter(function (v) { return v.tag === tag || v.tags.indexOf(tag) !== -1; }).reverse();
    page = clampPage(page, list);
    setMeta({
      title: tag + " Videos | VidTheme",
      description: "Watch free " + tag.toLowerCase() + " videos on VidTheme.",
      keywords: tag.toLowerCase() + " videos, " + HOME_KEYWORDS,
      canonical: SITE_URL + tagUrl(tag) + (page > 1 ? "?p=" + page : ""),
      ogType: "website"
    });
    app.innerHTML =
      toptitle(tag.toUpperCase() + " 2026 Videos", true) +
      renderGridInto(list, page, function (p) {
        return tagUrl(tag) + (p === 1 ? "" : "?p=" + p);
      });
    observeLazyImages();
  }

  function searchView(query, page) {
    var q = query.toLowerCase();
    var list = VIDEOS.filter(function (v) {
      return v.title.toLowerCase().indexOf(q) !== -1 || v.tag.toLowerCase().indexOf(q) !== -1;
    }).reverse();
    page = clampPage(page, list);
    setMeta({
      title: "Search: " + query + " — VidTheme",
      description: 'Search results for "' + query + '" on VidTheme.',
      keywords: query + ", " + HOME_KEYWORDS,
      canonical: SITE_URL + "/search?q=" + encodeURIComponent(query),
      robots: "noindex, follow",
      ogType: "website"
    });
    app.innerHTML =
      toptitle('Search Results for "' + query + '"', true) +
      renderGridInto(list, page, function (p) {
        return "/search?q=" + encodeURIComponent(query) + (p === 1 ? "" : "&p=" + p);
      });
    observeLazyImages();
  }

  var RELATED_PER_PAGE = 24; /* reference shows 24 related videos */

  function relatedList(video) {
    var sameTag = VIDEOS.filter(function (v) { return v.tag === video.tag && v.id !== video.id; });
    var others = VIDEOS.filter(function (v) { return v.tag !== video.tag; });
    return sameTag.concat(others);
  }

  function notFoundView() {
    setMeta({
      title: "Page Not Found | VidTheme",
      description: "This page does not exist on VidTheme.",
      keywords: HOME_KEYWORDS,
      canonical: SITE_URL + (window.location.pathname || "/"),
      robots: "noindex, nofollow",
      ogType: "website"
    });
    app.innerHTML =
      toptitle("Video Not Found", true) +
      '<p class="empty-note">This video does not exist or is not published yet. <a href="/">Back to the homepage</a></p>';
  }

  function videoView(slug) {
    var video = null;
    ALL_VIDEOS.forEach(function (v) { if (v.slug === slug) video = v; });
    /* Unknown id OR a draft: the public site shows not-found.
       (VIDEOS holds published videos only, so a draft id is
       simply absent there — ALL_VIDEOS is checked instead.) */
    if (!video || video.status === "draft") { notFoundView(); return; }
    var vTitle = video.seo_title || video.title;
    var vDesc = video.meta_description || ("Watch " + video.title + " on VidTheme — free " + (video.category || video.tag || "video").toLowerCase() + " video.");
    var vKw = video.meta_keywords || video.tags.join(", ");
    var vCanon = video.canonical || (SITE_URL + videoUrl(video));
    var vOgImg = absUrl(video.og_image || video.thumb || "/assets/og-image.svg");
    setMeta({
      title: vTitle + " | VidTheme",
      description: vDesc,
      keywords: vKw,
      canonical: vCanon,
      ogType: "video.movie",
      ogTitle: video.og_title || (vTitle + " | VidTheme"),
      ogDescription: video.og_description || vDesc,
      ogImage: vOgImg,
      ogImageAlt: video.og_image_alt || video.thumb_alt || video.title,
      ogVideo: { type: "text/html", width: 1280, height: 720, duration: durationSeconds(video.duration) },
      twitterCard: video.twitter_card || "summary_large_image",
      twitterImage: vOgImg,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: video.title,
        description: vDesc,
        thumbnailUrl: vOgImg,
        uploadDate: video.date || "",
        duration: isoDuration(video.duration),
        embedUrl: video.embed_url || "",
        contentUrl: vCanon
      }
    });

    /* Reference tags: .tags > .tagsstyle > a, one box per tag,
       no "Tags:" label, no border on the boxes. */
    var tagLinks = TAGS.map(function (t) {
      return '<div class="tagsstyle"><a href="' + tagUrl(t) + '">' + esc(t) + "</a></div>";
    }).join("");

    /* Player: the classic embed structure — a .player div holding
       .embed-responsive.embed-responsive-16by9, which contains the
       "Loading Video..." text and the embed iframe itself. The
       iframe is in the markup from the start (no click needed);
       its src is this video's embed_url from videos.json. */
    var playerHtml = video.embed_url
      ? '<div class="player">' +
          '<div class="embed-responsive embed-responsive-16by9">Loading Video...' +
            '<iframe class="embed-responsive-item" src="' + esc(video.embed_url) + '" referrerpolicy="no-referrer" allowfullscreen title="' + esc(video.title) + '"></iframe>' +
          "</div>" +
        "</div>"
      : '<div class="player">' +
          '<div class="embed-responsive embed-responsive-16by9">This video could not be loaded. Please try again later.</div>' +
        "</div>";

    /* Reference video-page order: ad(100), title, player, tags,
       ads(250,100,250), Related heading, related grid (24), Show-more
       LINK button to the tag page, ads(250,100). */
    var rel = relatedList(video);
    var relatedCards = rel.slice(0, RELATED_PER_PAGE).map(cardHtml).join("");
    var showMoreHtml =
      '<div class="loadbtn"><button class="button btn" type="button">' +
      '<a href="' + tagUrl(video.tag || TAGS[0]) + '">Show more related videos</a>' +
      "</button></div>";
    app.innerHTML =
      adWide("videoTop") +
      toptitle(video.title, false) +
      playerHtml +
      '<div class="tags">' + tagLinks + "</div>" +
      adRect("videoMidRect1") + adWide("videoMidWide") + adRect("videoMidRect2") +
      '<div class="related"><div>Related Videos</div></div>' +
      '<div class="thumbs"><ul>' + relatedCards + "</ul></div>" +
      showMoreHtml +
      adRect("videoBottomRect") + adWide("videoBottomWide");
    observeLazyImages();
  }

  var INFO = {
    terms: {
      title: "Terms of Use",
      body: [
        "By using this website you agree to these terms. The site provides a video browsing theme and catalogue for demonstration and general viewing.",
        "Content may be updated, moved or removed at any time. Do not misuse the site, attempt to disrupt it, or upload anything unlawful through any feature connected to it.",
        "These terms may change over time; the version published on this page is the one that applies."
      ]
    },
    privacy: {
      title: "Privacy Policy",
      body: [
        "This theme does not run accounts or collect personal profiles. Searches and page views happen in your browser.",
        "If analytics or advertising are connected later, this page should be updated to describe exactly what is collected and why.",
        "You can clear your browser storage at any time to remove anything stored locally by your browser."
      ]
    },
    contact: {
      title: "Contact",
      body: [
        "For questions about this website, its videos or a listing that should be corrected, please get in touch through the site owner's published contact channel.",
        "For copyright matters, please use the DMCA page so the request reaches the right place with the details needed."
      ]
    },
    dmca: {
      title: "DMCA",
      body: [
        "We respect the intellectual property rights of others. If you believe that material available on this site infringes your copyright, send a notice identifying the work, the exact page URL where it appears, and your contact details.",
        "Valid requests are reviewed promptly and infringing material is removed. Counter-notices are accepted where content was removed in error."
      ]
    }
  };

  function infoView(key) {
    var page = INFO[key];
    setMeta({
      title: page.title + " | VidTheme",
      description: page.body[0] || HOME_DESC,
      keywords: page.title.toLowerCase() + ", " + HOME_KEYWORDS,
      canonical: SITE_URL + "/" + key,
      ogType: "website"
    });
    app.innerHTML =
      toptitle(page.title, true) +
      '<div class="info-box">' +
      page.body.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      "</div>";
  }

  /* ---------- Share strip (mobile only): share the current page ---------- */
  function updateShareLinks() {
    var url = window.location.href;
    var title = document.title || "VidTheme";
    var u = encodeURIComponent(url);
    var t = encodeURIComponent(title);
    var map = {
      x: "https://twitter.com/intent/tweet?url=" + u + "&text=" + t,
      wa: "https://api.whatsapp.com/send?text=" + t + "%20" + u,
      reddit: "https://www.reddit.com/submit?url=" + u + "&title=" + t,
      msg: "https://www.facebook.com/dialog/send?link=" + u,
      tg: "https://t.me/share/url?url=" + u + "&text=" + t
    };
    var links = document.querySelectorAll("[data-share]");
    for (var i = 0; i < links.length; i++) {
      var k = links[i].getAttribute("data-share");
      if (map[k]) links[i].setAttribute("href", map[k]);
    }
  }

  function shareCurrent(btn) {
    var url = window.location.href;
    var title = document.title || "VidTheme";
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        if (!btn) return;
        var old = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = old; }, 1500);
      }, function () { window.prompt("Copy this link:", url); });
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  var moreBtns = document.querySelectorAll('[data-share="more"]');
  for (var m = 0; m < moreBtns.length; m++) {
    moreBtns[m].addEventListener("click", function (e) {
      shareCurrent(e.currentTarget || e.target);
    });
  }
  updateShareLinks();

  /* ---------- Routing (clean URLs, History API) ---------- */
  function parseQuery(search) {
    var out = {};
    if (!search) return out;
    search.replace(/^\?/, "").split("&").forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split("=");
      out[decodeURIComponent(kv[0] || "")] = decodeURIComponent(kv[1] || "");
    });
    return out;
  }

  function findVideoBySlug(slug) {
    var found = null;
    ALL_VIDEOS.forEach(function (v) { if (v.slug === slug) found = v; });
    return found;
  }
  function findVideoById(id) {
    var found = null;
    ALL_VIDEOS.forEach(function (v) { if (v.id === id) found = v; });
    return found;
  }
  /* A legacy URL that still carries the old -<id> suffix: the id
     must belong to the video whose slug precedes it — otherwise
     the path is just a new slug-only URL that happens to end in
     digits. On a match, normalise the address bar to the clean
     slug-only URL and render it. */
  function openLegacyVideo(id, slug, cat) {
    var video = findVideoById(id);
    if (!video || video.status === "draft" || video.slug !== slug || (cat && categorySlug(video) !== cat)) { notFoundView(); return; }
    window.history.replaceState(null, "", videoUrl(video));
    videoView(video.slug);
  }

  function route() {
    var path = window.location.pathname || "/";
    var qs = parseQuery(window.location.search || "");
    var m;

    if ((m = path.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)\.html$/)) && findTag(m[1])) {
      /* A video opens ONLY under its own main category. The same
         slug under any other category is not its URL. */
      var v0 = findVideoBySlug(m[2]);
      if (v0 && categorySlug(v0) === m[1]) videoView(m[2]);
      else notFoundView();
    } else if ((m = path.match(/^\/video\/(.+)-(\d+)\.html$/))) {
      /* Legacy video URL — the server 301s these to the clean
         URL; this branch only runs if a legacy URL is reached
         without the server (e.g. in-page navigation). */
      openLegacyVideo(parseInt(m[2], 10), m[1]);
    } else if ((m = path.match(/^\/([a-z0-9-]+)\/(.+)-(\d+)\.html$/)) && findTag(m[1])) {
      openLegacyVideo(parseInt(m[3], 10), m[2], m[1]);
    } else if ((m = path.match(/^\/tags\/([a-z0-9-]+)\.html$/))) {
      var tag = findTag(m[1]);
      if (tag) tagView(tag, parseInt(qs.p || "1", 10)); else homeView(1);
    } else if ((m = path.match(/^\/page\/(\d+)\.html$/))) {
      homeView(parseInt(m[1], 10));
    } else if (path === "/search") {
      searchView(qs.q || "", parseInt(qs.p || "1", 10));
    } else if ((m = path.match(/^\/(terms|privacy|contact|dmca)$/))) {
      infoView(m[1]);
    } else {
      homeView(1);
    }
    updateShareLinks(); /* share strip follows SPA navigation */
    activateAds(); /* pasted ad code runs through real DOM nodes */
    window.scrollTo(0, 0);
  }

  function navigate(href) {
    history.pushState(null, "", href);
    route();
  }

  /* Intercept internal links so navigation stays in-page (no reload). */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) !== "/" || href.indexOf("//") === 0) return;
    if (a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(href);
  });

  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = searchInput.value.trim();
    if (q) navigate("/search?q=" + encodeURIComponent(q));
  });

  window.addEventListener("popstate", route);

  function boot() {
    app.innerHTML = '<p class="empty-note">Loading videos…</p>';
    Promise.all([loadVideos(), loadSettings()])
      .then(function () { applySettings(); route(); })
      .catch(function () {
        app.innerHTML =
          '<p class="empty-note">Videos could not be loaded. Please try again later.</p>' +
          '<p class="empty-note"><button id="retryLoad" type="button">Try again</button></p>';
        var b = document.getElementById("retryLoad");
        if (b) b.addEventListener("click", boot);
      });
  }
  boot();
})();
