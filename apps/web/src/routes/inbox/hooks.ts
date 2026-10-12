import { useCallback, useEffect, useState } from "react";

/** Re-render every `intervalMs` so relative timestamps ("2s ago") stay fresh. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const UNSEEN_PREFIX = /^\(\d+\+?\) /;

/**
 * Prefix the tab title with the number of requests that arrived while the tab
 * was in the background — "(3) inb.sh" — and clear it once the tab is viewed.
 * Returns the callback to invoke for each new request.
 */
export function useUnseenTitle(): () => void {
  const [unseen, setUnseen] = useState(0);

  useEffect(() => {
    const onVisibility = () => !document.hidden && setUnseen(0);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.title = document.title.replace(UNSEEN_PREFIX, "");
    };
  }, []);

  useEffect(() => {
    const base = document.title.replace(UNSEEN_PREFIX, "");
    document.title = unseen ? `(${unseen > 99 ? "99+" : unseen}) ${base}` : base;
  }, [unseen]);

  return useCallback(() => {
    if (document.hidden) setUnseen((n) => n + 1);
  }, []);
}

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\]|.*\.local$)/;

/** Mirrors the worker's check: these targets are replayed from the browser. */
export function isPrivateUrl(url: string): boolean {
  try {
    return PRIVATE_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — not worth surfacing */
  }
}

export function downloadFile(
  filename: string,
  content: string | Uint8Array,
  type = "application/json",
) {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** True when focus is in a text field, so single-key shortcuts don't hijack typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    !!target.closest(".cm-editor")
  );
}
