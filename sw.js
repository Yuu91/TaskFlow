// 配信ファイルを変更するときは、このバージョンも変更する。
const CACHE_NAME = "taskflow-shell-v8";
const SHELL_FILES = [
  "./index.html", "./style.css", "./script.js", "./pwa.js",
  "./manifest.webmanifest", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];
const shellURLs = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).href));
const indexURL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", event => {
  // 全ファイルが揃わなければ更新を採用せず、現在の版を残す。
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    SHELL_FILES.map(path => new Request(new URL(path, self.registration.scope), { cache: "reload" }))
  )));
});
self.addEventListener("activate", event => {
  // 旧版を開いたタブが参照するキャッシュは削除しない。
  // localStorageには触れない。
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
  const appNavigation = request.mode === "navigate" &&
    (url.pathname === new URL(self.registration.scope).pathname ||
     url.pathname === new URL(indexURL).pathname);
  url.search = "";
  url.hash = "";
  if (!appNavigation && !shellURLs.has(url.href)) return;
  // 同じ版のHTML・JS・CSSを使用し、オンライン時も版の混在を防ぐ。
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(appNavigation ? indexURL : url.href);
    if (cached) return cached;
    return fetch(request);
  })());
});
