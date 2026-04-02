const STATIC_CACHE = "minimal3d-static-v1";
const RUNTIME_CACHE = "minimal3d-runtime-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./admin.html",
  "./css/ui.css",
  "./public/js/core/state.js",
  "./public/js/core/renderer.js",
  "./public/js/objects/factory.js",
  "./public/js/tools/transform.js",
  "./public/supabase.js",
  "./public/js/core/database.js",
  "./public/auth.js",
  "./public/js/core/main.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Alleen http/https requests behandelen
  if (!url.protocol.startsWith("http")) return;

  // Voor paginanavigatie: netwerk eerst, anders cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage =
            (await caches.match(request)) ||
            (await caches.match("./index.html")) ||
            (await caches.match("./"));
          return cachedPage;
        }),
    );
    return;
  }

  // Voor scripts, css, modules, afbeeldingen: cache first, daarna network
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);
        const copy = networkResponse.clone();
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, copy);
        return networkResponse;
      } catch (error) {
        return cachedResponse;
      }
    }),
  );
});
