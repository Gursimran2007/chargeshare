"use client";

/**
 * Last-resort error page, shown when the root layout itself fails (e.g. the
 * database is unreachable while loading the session). It renders its own
 * document, so it uses inline styles rather than the app stylesheet.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", background: "#fbfcfd", color: "#0a1730" }}>
        <title>ChargeShare is temporarily unavailable</title>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>ChargeShare</div>
          <h1 style={{ fontSize: 26, margin: "32px 0 8px" }}>We&apos;re having trouble right now</h1>
          <p style={{ color: "#4a5a70", lineHeight: 1.5 }}>
            Part of our service is temporarily unavailable. Your bookings and payments are safe. Please try again in a few minutes.
          </p>
          {error.digest ? (
            <p style={{ color: "#4a5a70", fontSize: 13 }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            onClick={() => retry()}
            style={{ marginTop: 20, background: "#0a1730", color: "#fff", border: 0, borderRadius: 12, padding: "12px 20px", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
