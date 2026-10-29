import { describe, expect, it } from "vitest";
import { publicLinkSource } from "@/lib/public-link-source";

const key = "synthetic-source-key-for-local-tests-only-0001";
const day = "2026-10-29";
const vercel = { vercel: true, local: false, key };
const proxy = { vercel: false, local: false, key, proxySecret: key };
describe("trusted public-link ingress", () => {
  it("uses only Vercel's controlled IP, not caller forwarded values", () => {
    const a = new Headers({
      "x-vercel-forwarded-for": "192.0.2.1",
      "x-forwarded-for": "198.51.100.1",
    });
    const hash = publicLinkSource(a, vercel, day);
    a.set("x-forwarded-for", "203.0.113.1");
    a.set("x-real-ip", "203.0.113.1");
    expect(publicLinkSource(a, vercel, day)).toBe(hash);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(publicLinkSource(a, vercel, "2026-10-30")).not.toBe(hash);
    expect(
      publicLinkSource(a, { ...vercel, key: key + "different" }, day),
    ).not.toBe(hash);
  });
  it.each(["", "192.0.2.1, 192.0.2.2", "192.0.2.1:80", "not-an-ip"])(
    "fails closed on missing or ambiguous ingress: %s",
    (value) => {
      expect(() =>
        publicLinkSource(
          new Headers({ "x-vercel-forwarded-for": value }),
          vercel,
          day,
        ),
      ).toThrow("LINK_SOURCE_UNAVAILABLE");
    },
  );
  it("does not trust VPS headers without the proxy key", () => {
    const headers = new Headers({
      "x-real-ip": "192.0.2.1",
      "x-glow-proxy-key": "spoofed",
    });
    expect(() => publicLinkSource(headers, proxy, day)).toThrow();
    headers.set("x-glow-proxy-key", key);
    expect(publicLinkSource(headers, proxy, day)).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      publicLinkSource(headers, { ...proxy, proxySecret: undefined }, day),
    ).toThrow();
  });
  it("normalizes IPv6 and mapped IPv4 instead of allowing quota rotation", () => {
    const source = (ip: string) =>
      publicLinkSource(
        new Headers({ "x-vercel-forwarded-for": ip }),
        vercel,
        day,
      );
    expect(source("2001:db8::1")).toBe(
      source("2001:0db8:0000:0000:0000:0000:0000:0001"),
    );
    expect(source("::ffff:192.0.2.1")).toBe(source("192.0.2.1"));
    expect(source("::ffff:c000:201")).toBe(source("192.0.2.1"));
  });
  it("ignores spoofed ingress in local mode and rejects missing server keys", () => {
    const local = { vercel: false, local: true, key };
    expect(
      publicLinkSource(
        new Headers({ "x-forwarded-for": "192.0.2.1" }),
        local,
        day,
      ),
    ).toBe(publicLinkSource(new Headers(), local, day));
    expect(() =>
      publicLinkSource(new Headers(), { ...local, key: "short" }, day),
    ).toThrow();
  });
});
