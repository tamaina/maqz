/* workbox 2019-10-10T01:47:57.314Z */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

self.addEventListener("install", function(event) {
  self.skipWaiting();
  self.clients.claim();
})

workbox.routing.registerRoute(
    /.*.(?:js|css|png|jpeg|jpg|svg|svgz|woff2)/,
    workbox.strategies.staleWhileRevalidate({
        cacheName: "assets-cache",
    })
);
workbox.precaching.precacheAndRoute([
    {
        url: "/offline/",
        revision: "1570672077314",
    }
]);
self.addEventListener("fetch", function(event) {
    event.respondWith(
        caches.match(event.request)
        .then(function(response) {
            return response || fetch(event.request);
        })
        .catch(function() {
            return caches.match("/offline/");
        })
    );
});
