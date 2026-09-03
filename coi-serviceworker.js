/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/* Minimal self-hosted variant used to force cross-origin isolation (COOP/COEP)
   on static hosts (like GitHub Pages) that cannot set custom response headers,
   so that SharedArrayBuffer (required by ffmpeg.wasm) becomes available. */
let coepCredentialless = false;
if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (!ev.data) {
      return;
    }
    if (ev.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.navigate(client.url));
        });
    } else if (ev.data.type === "coepCredentialless") {
      coepCredentialless = ev.data.value;
    }
  });

  self.addEventListener("fetch", function (event) {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
      return;
    }

    const request =
      coepCredentialless && r.mode === "no-cors"
        ? new Request(r, { credentials: "omit" })
        : r;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set(
            "Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp"
          );
          if (!coepCredentialless) {
            newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
          }
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");
    const coepDegrading = reloadedBySelf === "coepdegrade";

    if (window.crossOriginIsolated !== false || coepDegrading) {
      return;
    }

    if (!window.isSecureContext) {
      console.log("[coi] Service Worker not registered: a secure context is required.");
      return;
    }

    navigator.serviceWorker.register(window.document.currentScript.src).then(
      (registration) => {
        console.log("[coi] Service Worker registered", registration.scope);

        registration.addEventListener("updatefound", () => {
          console.log("[coi] Reloading page to use the updated Service Worker.");
          window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
          window.location.reload();
        });

        if (registration.active && !navigator.serviceWorker.controller) {
          console.log("[coi] Reloading page to use the Service Worker.");
          window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolled");
          window.location.reload();
        }
      },
      (err) => {
        console.error("[coi] Service Worker failed to register:", err);
      }
    );
  })();
}