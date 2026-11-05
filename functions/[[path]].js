/* VidTheme — clean-URL router (Cloudflare Pages Function).
 *
 * Serves index.html for every page the front-end app renders
 * (homepage, /page/NN.html, /video/<slug>-<id>.html,
 * /tags/<slug>.html, /search, /terms, /privacy, /contact, /dmca)
 * so a direct visit or refresh on a clean URL works.
 *
 * Passes through untouched: /api/*, /admin.html, /videos.json,
 * /assets/* and any other real file. Anything else gets a real
 * 404 response instead of the homepage. */
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

  const isPage =
    path === "/" ||
    /^\/page\/\d+\.html$/.test(path) ||
    /^\/video\/.+-\d+\.html$/.test(path) ||
    /^\/tags\/[a-z0-9-]+\.html$/.test(path) ||
    path === "/search" ||
    /^\/(terms|privacy|contact|dmca)$/.test(path);

  if (isPage) {
    const res = await context.env.ASSETS.fetch(new URL("/index.html", url));
    return new Response(res.body, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  return new Response(
    "<!doctype html><title>404 — VidTheme</title><body style=\"font-family:Arial,sans-serif;background:#e9e9e9;text-align:center;padding:60px 16px\">" +
      "<h1>404 — Page not found</h1><p>This page does not exist on VidTheme.</p>" +
      '<p><a href="/">Back to the homepage</a></p></body>',
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
