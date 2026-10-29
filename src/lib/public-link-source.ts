import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

type SourceConfiguration = {
  vercel: boolean;
  local: boolean;
  key: string;
  proxySecret?: string;
};

function equalSecret(supplied: string, expected: string) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicLinkSource(
  headers: Headers,
  config: SourceConfiguration,
  day = new Date().toISOString().slice(0, 10),
) {
  if (config.key.length < 32) throw new Error("LINK_SOURCE_UNAVAILABLE");
  let address: string | null;
  if (config.vercel) {
    // Vercel overwrites this header; never accept a caller's forwarded chain.
    address = headers.get("x-vercel-forwarded-for");
  } else if (
    config.local &&
    (!config.proxySecret || !headers.has("x-glow-proxy-key"))
  ) {
    // Loopback development also permits direct browser access. A deliberately
    // supplied proxy identity still has to authenticate below.
    address = "127.0.0.1";
  } else if (config.proxySecret) {
    if (
      config.proxySecret.length < 32 ||
      !equalSecret(headers.get("x-glow-proxy-key") ?? "", config.proxySecret)
    )
      throw new Error("LINK_SOURCE_UNAVAILABLE");
    address = headers.get("x-real-ip");
  } else throw new Error("LINK_SOURCE_UNAVAILABLE");

  if (!address || !isIP(address)) throw new Error("LINK_SOURCE_UNAVAILABLE");
  if (isIP(address) === 6) {
    address = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(address);
    if (mapped) {
      const n = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
      address = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(
        ".",
      );
    }
  }
  return createHmac("sha256", config.key)
    .update(`glow:public-link-source:v1\n${day}\n${address}`)
    .digest("hex");
}
