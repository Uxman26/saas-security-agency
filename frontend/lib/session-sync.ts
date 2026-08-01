/**
 * Keeps every open tab agreed on whether we are signed in.
 *
 * Logging out in one tab used to leave the others fully usable until something
 * happened to fail — the token was gone, but nothing told them. Two channels cover it:
 *
 * - a `storage` event, which the browser fires in *other* tabs whenever localStorage
 *   changes, so it works even for code that clears the token directly (the 401 handler
 *   in `lib/api.ts` does exactly that);
 * - a BroadcastChannel message, which reaches same-tab iframes and does not depend on
 *   the write itself being observable.
 */

export const TOKEN_KEY = 'token';
const CHANNEL_NAME = 'controlops-session';
const LOGOUT_MESSAGE = 'logout';

function channel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

/** Tell every other tab that the session is over. */
export function broadcastLogout(): void {
  const ch = channel();
  if (!ch) return;
  try {
    ch.postMessage(LOGOUT_MESSAGE);
  } finally {
    ch.close();
  }
}

/**
 * Run `onLogout` when any other tab signs out. Returns an unsubscribe function.
 *
 * Fires only on an actual transition to signed-out, so a tab that is already logged
 * out does not loop.
 */
export function onRemoteLogout(onLogout: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY && e.newValue === null) onLogout();
  };
  window.addEventListener('storage', handleStorage);

  const ch = channel();
  const handleMessage = (e: MessageEvent) => {
    if (e.data === LOGOUT_MESSAGE) onLogout();
  };
  ch?.addEventListener('message', handleMessage);

  return () => {
    window.removeEventListener('storage', handleStorage);
    ch?.removeEventListener('message', handleMessage);
    ch?.close();
  };
}
