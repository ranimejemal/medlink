// Inactivity timeout (US-40). The last activity time lives in localStorage so it is
// shared by every open tab and survives a page reload.
export const IDLE_MS = 15 * 60 * 1000;
const KEY = "medlink:last-activity";

export function markActivity() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: the in-memory timer still applies */
  }
}
export function idleExpired(): boolean {
  try {
    const last = Number(localStorage.getItem(KEY));
    return last > 0 && Date.now() - last >= IDLE_MS;
  } catch {
    return false;
  }
}

export function clearActivity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
