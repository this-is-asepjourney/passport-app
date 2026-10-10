/**
 * Media helper functions (Client & Server safe)
 */

/**
 * Normalizes media URLs:
 * If an image URL points to the blocked *.r2.dev Cloudflare public domain
 * (blocked by Indonesian ISP Trust Positif / Internet Positif DNS),
 * this automatically transforms it to the high-performance local proxy:
 * `/api/media/...`
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.includes('.r2.dev/')) {
    const parts = url.split('.r2.dev/');
    const key = parts[1];
    if (key) return `/api/media/${key}`;
  }
  return url;
}
