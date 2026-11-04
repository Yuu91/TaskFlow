// Cloudflare-only worker. GitHub Pages continues using the root sw.js unchanged.
const CACHE_NAME = "seedonext-cloudflare-shell-template";
const SHELL_FILES = [
  "./", "./style.css", "./recommendation.js", "./script.js", "./pwa.js",
  "./manifest.webmanifest", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];
const appURL = new URL("./", self.registration.scope).href;
const indexAliasURL = new URL("./index.html", self.registration.scope).href;
const shellURLs = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).href));

// A followed redirect cannot be used for a manual-redirect navigation request.
// Preserve the HTML, status and headers, but do not propagate redirect history.
function navigationResponse(response) {
  return response.redirected
    ? new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response;
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    SHELL_FILES.map(path => new Request(new URL(path, self.registration.scope), { cache: "reload" }))
  )));
});
self.addEventListener("activate", event => {
  // Keep old caches for open old tabs. Never modify localStorage or task data.
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  url.search = "";
  url.hash = "";
  const appNavigation = request.mode === "navigate" && (url.href === appURL || url.href === indexAliasURL);
  if (!appNavigation && !shellURLs.has(url.href)) return;
  event.respondWith((async () => {
    const key = appNavigation ? appURL : url.href;
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(key);
      if (cached) return appNavigation ? navigationResponse(cached) : cached;
    } catch (_) { /* Cache failure must not block an available network. */ }
    try {
      const response = await fetch(appNavigation
        ? new Request(appURL, { cache: "reload", redirect: "follow", credentials: "same-origin" })
        : request);
      const safe = appNavigation ? navigationResponse(response) : response;
      if (safe.ok && cache) {
        try { await cache.put(key, safe.clone()); } catch (_) { /* Return network response even when storage is full. */ }
      }
      return safe;
    } catch (_) {
      if (!appNavigation) return Response.error();
      return new Response(
        '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SeeDonext — オフライン</title><h1>オフライン用の画面を読み込めません</h1><p>保存済みのタスクは削除していません。オンラインに戻ってから再読み込みしてください。</p><p><a href="./">再読み込み</a> · <a href="/recovery/">オンラインでアプリの接続を修復</a></p></html>',
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  })());
});
