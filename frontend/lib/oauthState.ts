"use client";

/**
 * CSRF protection for the integration OAuth flows.
 *
 * Without a `state` parameter, anyone who can make the browser load
 * `/settings/<provider>/callback?code=...` causes that code to be exchanged
 * and the resulting account linked into the signed-in user's DevPulse
 * account. Binding a one-time random value to the browser session and
 * checking it on return closes that.
 *
 * The value is kept in sessionStorage: it is scoped to the tab, cleared when
 * the tab closes, and never sent anywhere except to the provider as `state`.
 */

const KEY_PREFIX = "devpulse_oauth_state:";

function randomState(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers without randomUUID.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create and persist a fresh `state` for the given provider. */
export function createOAuthState(provider: string): string {
  const state = randomState();
  try {
    sessionStorage.setItem(KEY_PREFIX + provider, state);
  } catch {
    // sessionStorage unavailable (private mode / disabled) — the callback
    // will treat the missing value as a mismatch and refuse to exchange.
  }
  return state;
}

/**
 * Verify and consume the `state` returned by the provider.
 * Single-use: the stored value is removed whether or not it matched.
 */
export function consumeOAuthState(provider: string, returned: string | null): boolean {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(KEY_PREFIX + provider);
    sessionStorage.removeItem(KEY_PREFIX + provider);
  } catch {
    return false;
  }
  return Boolean(stored) && Boolean(returned) && stored === returned;
}

export const OAUTH_STATE_ERROR =
  "Security check failed: this sign-in request did not originate from this browser session. " +
  "Please return to Settings and start the connection again.";
