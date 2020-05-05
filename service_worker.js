/* workbox 2020-05-05T10:01:54.924Z */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

workbox.core.skipWaiting();
workbox.core.clientsClaim();
workbox.googleAnalytics.initialize();

workbox.routing.registerRoute(
  /.*\.(?:js|css|png|jpeg|jpg|svg|svgz|woff2)/,
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "assets-cache",
  })
);

workbox.routing.registerRoute(
  /.*(?:googleapis|gstatic)\.com/,
  new workbox.strategies.StaleWhileRevalidate(),
);

workbox.routing.registerRoute(
  /^https:\/\/cdn\.jsdelivr\.net/,
  new workbox.strategies.CacheFirst({
    cacheName: 'jsdelivr',
    plugins: [
      new workbox.cacheableResponse.Plugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.Plugin({
        maxAgeSeconds: 60 * 60 * 24 * 365,
        maxEntries: 160
      })
    ]
  })
);

workbox.routing.registerRoute(
  /\.(?:png|jpg|jpeg|webp|svg|gif)\?v=1.0.0$/,
  new workbox.strategies.CacheFirst({
    cacheName: 'images',
    plugins: [
      new workbox.cacheableResponse.Plugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.Plugin({
        maxAgeSeconds: 60 * 60 * 24 * 365,
        maxEntries: 160
      })
    ]
  })
);
workbox.precaching.precacheAndRoute([
    {
        url: "/offline",
        revision: "1588672914924",
    }
]);

self.addEventListener("fetch", function(event) {
  event.respondWith(
      caches.match(event.request)
      .then(function(response) {
          return response || fetch(event.request);
      })
      .catch(function() {
          return caches.match("/offline");
      })
  );
});
