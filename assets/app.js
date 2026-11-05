/* VidTheme — front-end app.
   Videos are NOT embedded in this file. They are fetched from
   videos.json on GitHub raw on every load (cache-buster), with a
   fallback to the local videos.json, so a new video published via
   the admin appears without a Pages redeploy.
   Clean URLs via the History API:
     /                              homepage
     /page/02.html                  homepage, page 2
     /video/<slug>-<id>.html        video page
     /tags/<slug>.html              tag page (?p=2 for page 2)
     /search?q=<query>              search results (?p=2 …)
     /terms, /privacy, /contact, /dmca
   The Pages Function functions/[[path]].js serves index.html for
   these paths, so a direct visit / refresh works too. */
(function () {
  "use strict";

  var GITHUB_RAW_URL =
    "https://raw.githubusercontent.com/facttube78600-ai/vidtehemsite/main/videos.json";
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

  function videoUrl(v) { return "/video/" + v.slug + "-" + v.id + ".html"; }
  function tagUrl(tag) { return "/tags/" + tagSlug(tag) + ".html"; }

  /* Normalise one videos.json entry to the shape the views use. */
  function normalise(v) {
    var tags = v.tags && v.tags.length ? v.tags : (v.tag ? [v.tag] : (v.category ? [v.category] : []));
    return {
      id: v.id,
      slug: v.slug || slugify(v.title || ("video-" + v.id)),
      title: v.title || "Untitled video",
      duration: v.duration || "",
      thumb: v.thumbnail || v.thumb || "",
      embed_url: v.embed_url || "",
      tags: tags,
      tag: tags[0] || "",
      category: v.category || tags[0] || "",
      date: v.date || ""
    };
  }

  function loadVideos() {
    var bust = "?v=" + Date.now();
    return fetch(GITHUB_RAW_URL + bust, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("GitHub raw HTTP " + r.status);
        return r.json();
      })
      .catch(function () {
        return fetch("videos.json" + bust, { cache: "no-store" }).then(function (r) {
          if (!r.ok) throw new Error("local videos.json HTTP " + r.status);
          return r.json();
        });
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data.videos || []);
        VIDEOS = list.map(normalise).sort(function (a, b) { return a.id - b.id; });
      });
  }

  /* Brand row — COLOURED TEXT BUTTONS (not images), one per tag:
     ~95x50, vertical gradient, white bold uppercase text, 4px gaps.
     Colours sampled from the user's button screenshot. */
  brandRow.innerHTML = TAGS.map(function (t) {
    return (
      '<li><a class="brand-' + tagSlug(t) + '" href="' + tagUrl(t) + '" data-tag="' + esc(t) + '" aria-label="' + esc(t) + '" title="' + esc(t) + '">' +
      esc(t.toUpperCase()) +
      "</a></li>"
    );
  }).join("");

  function markActiveTag(tag) {
    var links = brandRow.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle("active", links[i].getAttribute("data-tag") === tag);
    }
  }

  /* ---------- Ad slots (empty placeholder containers) ---------- */
  function adWide() { return '<div class="ad-slot wide" role="complementary" aria-label="Advertisement slot">Advertisement</div>'; }
  function adRect() { return '<div class="ad-slot rect" role="complementary" aria-label="Advertisement slot">Advertisement</div>'; }

  /* ---------- Cards & pagination ---------- */
  /* Reference card: .thumb_wrap > a.thumb_link (image + timer only) +
     sibling .thumb_title strip OUTSIDE the link. Only the image is
     clickable; the title strip is pale teal, one truncated line. */
  function cardHtml(v) {
    return (
      '<div class="thumb_wrap">' +
        '<a href="' + videoUrl(v) + '" class="thumb_link" title="' + esc(v.title) + '">' +
          '<div class="thumb_img">' +
            '<img class="img_prev" src="' + esc(v.thumb) + '" alt="' + esc(v.title) + '" loading="lazy" width="100%" height="auto" />' +
            '<div class="timer">' + esc(v.duration) + "</div>" +
          "</div>" +
        "</a>" +
        '<div class="thumb_title">' + esc(v.title) + "</div>" +
      "</div>"
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

  function paginationHtml(current, total, hrefFor) {
    if (total <= 1) return "";
    var html = '<nav class="pagination" aria-label="Pages">';
    pageList(current, total).forEach(function (p) {
      if (p === ".") html += '<span class="dots" aria-hidden="true">.</span>';
      else if (p === current) html += '<span class="current" aria-current="page">' + p + "</span>";
      else html += '<a href="' + hrefFor(p) + '" aria-label="Page ' + p + '">' + p + "</a>";
    });
    return html + "</nav>";
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

  function headingBar(text, left) {
    return '<div class="heading-bar' + (left ? " left" : "") + '"><div class="wrap"><h1>' + esc(text) + "</h1></div></div>";
  }

  function renderGridInto(list, page, hrefFor) {
    if (!list.length) return '<div class="wrap"><p class="empty-note">No videos found.</p></div>';
    var cards = gridPage(list, page).map(cardHtml).join("");
    return (
      '<div class="wrap">' + adWide() + "</div>" +
      '<div class="wrap">' + paginationHtml(page, totalPages(list), hrefFor) + "</div>" +
      '<div class="wrap"><div class="grid">' + cards + "</div></div>" +
      '<div class="wrap">' + paginationHtml(page, totalPages(list), hrefFor) + "</div>" +
      '<div class="wrap">' + adRect() + "</div>" +
      '<div class="wrap">' + adWide() + "</div>"
    );
  }

  /* ---------- Views ---------- */
  function homeView(page) {
    markActiveTag(null);
    var list = VIDEOS.slice().reverse(); /* newest first */
    page = clampPage(page, list);
    document.title = "VidTheme";
    app.innerHTML =
      headingBar("Latest Videos") +
      renderGridInto(list, page, function (p) { return p === 1 ? "/" : "/page/" + String(p).padStart(2, "0") + ".html"; });
  }

  function tagView(tag, page) {
    markActiveTag(tag);
    var list = VIDEOS.filter(function (v) { return v.tag === tag || v.tags.indexOf(tag) !== -1; }).reverse();
    page = clampPage(page, list);
    document.title = tag + " 2026 Videos — VidTheme";
    app.innerHTML =
      headingBar(tag.toUpperCase() + " 2026 Videos") +
      renderGridInto(list, page, function (p) {
        return tagUrl(tag) + (p === 1 ? "" : "?p=" + p);
      });
  }

  function searchView(query, page) {
    markActiveTag(null);
    var q = query.toLowerCase();
    var list = VIDEOS.filter(function (v) {
      return v.title.toLowerCase().indexOf(q) !== -1 || v.tag.toLowerCase().indexOf(q) !== -1;
    }).reverse();
    page = clampPage(page, list);
    document.title = "Search: " + query + " — VidTheme";
    app.innerHTML =
      headingBar('Search Results for "' + query + '"') +
      renderGridInto(list, page, function (p) {
        return "/search?q=" + encodeURIComponent(query) + (p === 1 ? "" : "&p=" + p);
      });
  }

  var RELATED_PER_PAGE = 24; /* reference shows 24 related videos */

  function relatedList(video) {
    var sameTag = VIDEOS.filter(function (v) { return v.tag === video.tag && v.id !== video.id; });
    var others = VIDEOS.filter(function (v) { return v.tag !== video.tag; });
    return sameTag.concat(others);
  }

  function videoView(id) {
    var video = null;
    VIDEOS.forEach(function (v) { if (v.id === id) video = v; });
    if (!video) { homeView(1); return; }
    markActiveTag(video.tag);
    document.title = video.title + " — VidTheme";

    var tagLinks = TAGS.map(function (t) {
      return '<a href="' + tagUrl(t) + '">' + esc(t) + "</a>";
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

    /* Reference video-page order: ad(100), title bar, player, tags,
       ads(250,100,250), Related heading, related grid (24), Show-more
       LINK button to the tag page, ads(250,100). */
    var rel = relatedList(video);
    var relatedCards = rel.slice(0, RELATED_PER_PAGE).map(cardHtml).join("");
    var showMoreHtml =
      '<div class="loadbtn"><button class="button btn" type="button">' +
      '<a href="' + tagUrl(video.tag || TAGS[0]) + '">Show more related videos</a>' +
      "</button></div>";
    app.innerHTML =
      '<div class="wrap">' + adWide() + "</div>" +
      '<div class="wrap">' +
        '<div class="video-title-bar"><h1>' + esc(video.title) + "</h1></div>" +
        playerHtml +
        '<div class="video-tags">' + tagLinks + "</div>" +
        adRect() + adWide() + adRect() +
      "</div>" +
      '<div class="wrap"><div class="related-heading"><div class="related-label">Related Videos</div><div class="related-line"></div></div></div>' +
      '<div class="wrap"><div class="grid">' + relatedCards + "</div>" +
      showMoreHtml +
      adRect() + adWide() + "</div>";
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
    markActiveTag(null);
    var page = INFO[key];
    document.title = page.title + " — VidTheme";
    app.innerHTML =
      headingBar(page.title) +
      '<div class="wrap"><div class="info-box">' +
      page.body.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      "</div></div>";
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

  function route() {
    var path = window.location.pathname || "/";
    var qs = parseQuery(window.location.search || "");
    var m;

    if ((m = path.match(/^\/video\/.+-(\d+)\.html$/))) {
      videoView(parseInt(m[1], 10));
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

  app.innerHTML = '<div class="wrap"><p class="empty-note">Loading videos…</p></div>';
  loadVideos()
    .then(function () { route(); })
    .catch(function () {
      app.innerHTML = '<div class="wrap"><p class="empty-note">Videos could not be loaded. Please try again later.</p></div>';
    });
})();
