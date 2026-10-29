import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { account, login, origin } from "./helpers";

test("an owner operation holding the actual tenant lock does not block unrelated FK inserts", async ({
  page,
}) => {
  const owner = await account();
  await login(page, owner);
  const holder = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_Nextapp",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "";
  holder.stdout.on("data", (b) => (output += String(b)));
  const exited = new Promise((resolve) => holder.on("close", resolve));
  holder.stdin.write(
    `begin; select set_config('request.jwt.claims','{"sub":"${owner.id}","role":"authenticated"}',true);do $$begin perform app_private.management_owner();end;$$;\n\\echo actual-tenant-lock-held\n`,
  );
  try {
    await expect
      .poll(() => output.includes("actual-tenant-lock-held"))
      .toBe(true);
    let completed = false;
    const pending = page.request
      .post("/api/clients", {
        headers: origin,
        data: {
          first_name: "Cliente sintetica",
          last_name: "FK concurrent",
          email: "",
          phone: "",
        },
      })
      .then((r) => {
        completed = true;
        return r;
      });
    await expect.poll(() => completed, { timeout: 3000 }).toBe(true);
    expect((await pending).status()).toBe(201);
  } finally {
    holder.stdin.end("rollback;\n");
    expect(await exited).toBe(0);
  }
});
