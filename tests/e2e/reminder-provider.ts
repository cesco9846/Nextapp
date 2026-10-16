import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  envelopeSchema,
  type Envelope,
  type ReminderProvider,
  type Result,
  type LookupResult,
} from "@/reminders/contracts";
export class FixtureProvider implements ReminderProvider {
  readonly name = "test-v1";
  constructor(private base: string) {
    if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
      throw new Error("Local fixture transport only");
  }
  async send(
    envelope: Envelope,
    key: string,
    signal: AbortSignal,
  ): Promise<Result> {
    const r = await fetch(`${this.base}/send`, {
      method: "POST",
      body: JSON.stringify({ envelope, key }),
      signal,
    });
    if (!r.ok) return { kind: "unknown" };
    return r.json();
  }
  async lookup(key: string, signal: AbortSignal): Promise<LookupResult> {
    const r = await fetch(
      `${this.base}/lookup?key=${encodeURIComponent(key)}`,
      { signal },
    );
    return r.ok ? r.json() : { kind: "unknown" };
  }
}
export async function fixtureGateway(
  mode: "normal" | "accept-and-hold" | "retryable" | "unknown" = "normal",
) {
  const ledger = new Map<string, { id: string; envelope: Envelope }>();
  let sends = 0,
    lookups = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/send") {
      sends++;
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (raw.length > 8192) {
          res.writeHead(413).end();
          return;
        }
      }
      const input = JSON.parse(raw) as { key: string; envelope: Envelope };
      const envelope = envelopeSchema.parse(input.envelope);
      if (mode === "retryable") {
        res.end(JSON.stringify({ kind: "retryable" }));
        return;
      }
      if (mode === "unknown") {
        res.end(JSON.stringify({ kind: "unknown" }));
        return;
      }
      let prior = ledger.get(input.key);
      if (
        prior &&
        JSON.stringify(prior.envelope) !== JSON.stringify(envelope)
      ) {
        res.writeHead(409).end();
        return;
      }
      if (!prior) {
        prior = { id: crypto.randomUUID(), envelope };
        ledger.set(input.key, prior);
      }
      if (mode === "accept-and-hold") return;
      res.end(JSON.stringify({ kind: "accepted", providerId: prior.id }));
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/lookup?")) {
      lookups++;
      const value = ledger.get(
        new URL(req.url, "http://localhost").searchParams.get("key") ?? "",
      );
      // This fixture service owns complete history for its lifetime, unlike a restarted in-memory adapter.
      res.end(
        JSON.stringify(
          value
            ? { kind: "accepted", providerId: value.id }
            : { kind: "absent" },
        ),
      );
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    ledger,
    get sends() {
      return sends;
    },
    get lookups() {
      return lookups;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
