import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { webkit, type LaunchOptions } from "@playwright/test";

// The managed Debian cloud runs without root. Its extra, APT-verified libraries
// live in the workspace. The bundled shell launcher overwrites LD_LIBRARY_PATH;
// launch the exact binary from that same pinned Playwright download instead.
// No browser files are patched and no host-validation skip flag is set.
export function cloudWebkitOptions(): LaunchOptions {
  const bundle = resolve(dirname(webkit.executablePath()), "minibrowser-wpe");
  const libraries = resolve(
    import.meta.dirname,
    "../.cache/webkit-libs/usr/lib/x86_64-linux-gnu",
  );
  const executablePath = resolve(bundle, "bin/MiniBrowser");
  if (
    !existsSync(executablePath) ||
    !existsSync(resolve(libraries, "libgtk-4.so.1"))
  )
    throw new Error(
      "Prepare local WebKit with python3 scripts/setup-webkit-cloud.py",
    );
  return {
    executablePath,
    env: {
      ...process.env,
      WEBKIT_EXEC_PATH: resolve(bundle, "bin"),
      WEBKIT_INJECTED_BUNDLE_PATH: resolve(bundle, "lib"),
      WEBKIT_INSPECTOR_RESOURCES_PATH: resolve(bundle, "share"),
      LD_LIBRARY_PATH: [
        resolve(bundle, "lib"),
        resolve(bundle, "sys/lib"),
        libraries,
        process.env.LD_LIBRARY_PATH,
      ]
        .filter(Boolean)
        .join(":"),
    },
  };
}
