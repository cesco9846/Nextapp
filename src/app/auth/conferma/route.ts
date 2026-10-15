import { NextResponse } from "next/server";
import { serverSupabase } from "@/server/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  if (code) {
    const db = await serverSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          ["/nuova-password", "/invito"].includes(
            url.searchParams.get("next") ?? "",
          )
            ? url.searchParams.get("next")!
            : "/app/agenda",
          origin,
        ),
      );
  }
  return NextResponse.redirect(new URL("/accedi?errore=collegamento", origin));
}
