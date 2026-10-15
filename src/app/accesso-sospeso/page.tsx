import { redirect } from "next/navigation";
import { serverSupabase } from "@/server/supabase";
import { checkDb } from "@/server/http";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";

export default async function SuspendedPage() {
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/accedi");
  const state = await db.rpc("membership_state");
  checkDb(state.error);
  if (state.data !== "inactive")
    redirect(state.data === "active" ? "/app/agenda" : "/configurazione");
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-7 px-6 py-12">
      <Brand />
      <h1 className="text-3xl">Accesso allo studio sospeso</h1>
      <p className="text-muted-foreground">
        La titolare ha sospeso il tuo accesso. Contattala per riattivarlo. I
        tuoi appuntamenti e lo storico dello studio sono conservati.
      </p>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
