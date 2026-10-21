import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

const base = { nonce: "abc123", dev: false, tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", razorpay: false, https: false };
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("content security policy", () => {
  it("allows only nonce-bearing scripts in production (no unsafe-inline / unsafe-eval)", () => {
    const s = directive(buildCsp(base), "script-src");
    expect(s).toContain("'nonce-abc123'");
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain("unsafe-inline");
    expect(s).not.toContain("unsafe-eval");
    expect(directive(buildCsp({ ...base, dev: true }), "script-src")).toContain("'unsafe-eval'");
  });
  it("blocks framing, plugins and foreign form posts", () => {
    const csp = buildCsp(base);
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
  });
  it("allows the configured map tile origin, including {s} subdomains", () => {
    expect(directive(buildCsp(base), "img-src")).toContain("https://tile.openstreetmap.org");
    expect(directive(buildCsp({ ...base, tileUrl: "https://{s}.tiles.example.com/{z}/{x}/{y}.png" }), "img-src")).toContain("https://*.tiles.example.com");
  });
  it("opens only Razorpay's checkout origins when Razorpay is enabled", () => {
    const csp = buildCsp({ ...base, razorpay: true });
    expect(directive(csp, "frame-src")).toBe("frame-src https://checkout.razorpay.com https://api.razorpay.com");
    expect(directive(csp, "connect-src")).toContain("https://api.razorpay.com");
  });
  it("upgrades insecure requests only on HTTPS deployments", () => {
    expect(buildCsp(base)).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ ...base, https: true })).toContain("upgrade-insecure-requests");
  });
});
