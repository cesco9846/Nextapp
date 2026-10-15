"use client";
import { useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await browserSupabase().auth.signOut({ scope: "local" });
        window.location.replace(
          new URL("/accedi", window.location.origin).href,
        );
      }}
    >
      {busy ? "Uscita…" : "Esci e cambia account"}
    </Button>
  );
}
