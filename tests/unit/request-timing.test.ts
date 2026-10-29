import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { measureRequest, withApiTiming } from "@/server/request-timing";

it("concurrent responses contain only their own fixed timing labels", async () => {
  const [a, b] = await Promise.all([
    withApiTiming(async () => {
      await measureRequest(
        "auth",
        async () => new Promise((resolve) => setTimeout(resolve, 3)),
      );
      return new Response("A");
    }),
    withApiTiming(async () => {
      await measureRequest(
        "profile",
        async () => new Promise((resolve) => setTimeout(resolve, 5)),
      );
      return new Response("B");
    }),
  ]);
  expect(a.headers.get("server-timing")).toMatch(
    /^api;dur=[\d.]+, auth;dur=[\d.]+$/,
  );
  expect(b.headers.get("server-timing")).toMatch(
    /^api;dur=[\d.]+, profile;dur=[\d.]+$/,
  );
  await expect(
    measureRequest("auth", async () => "outside HTTP"),
  ).resolves.toBe("outside HTTP");
});
