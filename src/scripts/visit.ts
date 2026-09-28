/**
 * Counts this visit, once per browser session (worker/visits.ts). Automated
 * browsers (navigator.webdriver) aren't counted.
 */
export function countVisit() {
  try {
    if (navigator.webdriver || sessionStorage.getItem("visit-counted")) return;
    sessionStorage.setItem("visit-counted", "1");
    void fetch("/api/visits", { method: "POST", keepalive: true, credentials: "omit" }).catch(() => {});
  } catch {}
}
