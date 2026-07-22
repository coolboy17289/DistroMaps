/**
 * Favicon utility - fetches favicons from distro websites using Google's Favicon API
 * This works on Vercel without needing to scrape websites directly
 */

/**
 * Extract domain from a website URL
 */
export function extractDomain(website: string | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website);
    return url.hostname;
  } catch {
    try {
      const url = new URL(`https://${website}`);
      return url.hostname;
    } catch {
      return null;
    }
  }
}

/**
 * Get favicon URL for a domain using Google's Favicon API
 * This is reliable and works on Vercel without CORS issues
 */
export function getFaviconUrl(website: string | undefined, size: number = 32): string | null {
  const domain = extractDomain(website);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

/**
 * Get a larger favicon for the side panel display
 */
export function getLargeFaviconUrl(website: string | undefined): string | null {
  return getFaviconUrl(website, 64);
}

/**
 * Image cache for loaded favicon images on the canvas
 */
const imageCache = new Map<string, HTMLImageElement>();
const loadingImages = new Set<string>();
const failedImages = new Set<string>();

/**
 * Preload a favicon image for canvas rendering (non-blocking).
 * Returns the image if already cached, otherwise starts async load.
 */
export function getFaviconImage(website: string | undefined, size: number = 32): HTMLImageElement | null {
  const url = getFaviconUrl(website, size);
  if (!url) return null;

  // Return cached image if available
  const cached = imageCache.get(url);
  if (cached) return cached;

  // Don't re-attempt failed URLs
  if (failedImages.has(url)) return null;

  // Don't start duplicate loads
  if (loadingImages.has(url)) return null;

  loadingImages.add(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  img.onload = () => {
    imageCache.set(url, img);
    loadingImages.delete(url);
  };
  img.onerror = () => {
    failedImages.add(url);
    loadingImages.delete(url);
  };

  return null;
}
