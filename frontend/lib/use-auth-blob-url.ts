'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Fetches a protected file with the bearer token and returns a blob URL for it.
 *
 * Needed because `<img src>` and `<a href>` cannot carry an Authorization header.
 * Uploaded files (guard photos, incident attachments, patrol scans) are served from
 * authenticated, tenant-scoped endpoints rather than a public directory, so they have
 * to be fetched in JS and handed to the DOM as an object URL.
 *
 * Pass an API-relative path such as `/incidents/12/attachments/3/file`. The object URL
 * is revoked when the path changes or the component unmounts.
 */
export function useAuthBlobUrl(path?: string | null): string | null {
  // Keyed by the path it was loaded from, so switching paths reads as "not loaded yet"
  // rather than briefly showing the previous file.
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    const token = localStorage.getItem('token')?.trim();

    void fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        blobUrl = URL.createObjectURL(blob);
        setLoaded({ path, url: blobUrl });
      })
      .catch(() => {
        /* leave unloaded; the caller renders its own fallback */
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [path]);

  return path && loaded?.path === path ? loaded.url : null;
}

/**
 * Opens a protected file in a new tab.
 *
 * For one-off clicks where holding a blob URL for every row would be wasteful. The
 * object URL is released once the new tab has had a chance to load it.
 */
export async function openAuthFile(path: string): Promise<boolean> {
  const token = localStorage.getItem('token')?.trim();
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return false;
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}
