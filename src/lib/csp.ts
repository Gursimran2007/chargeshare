/**
 * Content-Security-Policy for HTML responses. Pure function so it can be unit tested.
 *
 * - Scripts: per-request nonce + 'strict-dynamic'. Next.js applies the nonce to its own
 *   scripts; scripts those load (e.g. Razorpay's checkout.js via next/script) are trusted
 *   transitively. No 'unsafe-inline' scripts in production.
 * - Styles: 'unsafe-inline' is kept deliberately. React style attributes and the toast
 *   library inject inline styles, and browsers ignore 'unsafe-inline' once a nonce is
 *   listed, so a style nonce would break them. Inline styles cannot execute code.
 */
export interface CspOptions {
  nonce: string;
  dev: boolean;
  tileUrl: string; // map tile template; its origin is allowed for images
  razorpay: boolean;
  https: boolean;
}

function origin(url: string) {
  try {
    // Leaflet templates contain {s}/{z}; replace before parsing, and allow subdomains for {s}.
    const u = new URL(url.replace(/\{[a-z]\}/g, "a"));
    return url.includes("{s}.") ? `${u.protocol}//*.${u.host.split(".").slice(1).join(".")}` : u.origin;
  } catch {
    return null;
  }
}

export function buildCsp(o: CspOptions) {
  const tiles = origin(o.tileUrl);
  const rzp = o.razorpay ? ["https://checkout.razorpay.com", "https://api.razorpay.com"] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'", ...(o.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(tiles ? [tiles] : []), ...(o.razorpay ? ["https://cdn.razorpay.com"] : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(o.dev ? ["ws:", "wss:"] : []), ...(o.razorpay ? ["https://api.razorpay.com", "https://lumberjack.razorpay.com"] : [])],
    "frame-src": rzp.length ? rzp : ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (o.https) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
