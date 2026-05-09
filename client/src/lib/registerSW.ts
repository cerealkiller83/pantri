/**
 * Register the Pantri service worker in production builds only.
 * Vite's dev server sends `Cache-Control: no-cache` to avoid stale state during development.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // Silent — offline support is progressive enhancement only.
        console.warn("[Pantri] SW registration failed", err);
      });
  });
}
