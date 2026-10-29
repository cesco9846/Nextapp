import { expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { ApiError, handleApi, json, readBody } from "@/server/http";

it("bounds streamed request bytes even when content length is absent", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(16384));
      controller.enqueue(new Uint8Array(16385));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body,
    // Node's streamed fetch requests require duplex.
    ...{ duplex: "half" },
  });
  const response = await handleApi(async () =>
    json(await readBody(request, z.object({}))),
  );
  expect(response.status).toBe(413);
  expect(cancelled).toBe(true);
});

it("decodes a multibyte Italian character split across stream chunks", async () => {
  const bytes = new TextEncoder().encode('{"name":"È"}');
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 10));
      controller.enqueue(bytes.slice(10));
      controller.close();
    },
  });
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body,
    ...{ duplex: "half" },
  });
  await expect(
    readBody(request, z.object({ name: z.string() })),
  ).resolves.toEqual({ name: "È" });
});

it("rate limited responses are private and advertise a bounded retry", async () => {
  const response = await handleApi(async () => {
    throw new ApiError(429, "Attendi", "RATE_LIMIT");
  });
  expect(response.headers.get("retry-after")).toBe("60");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
