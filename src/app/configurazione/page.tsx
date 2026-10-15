import { redirect } from "next/navigation";
import { serverSupabase } from "@/server/supabase";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function SetupPage() {
  const db = await serverSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/accedi");
  const membership = await db.rpc("membership_state");
  if (membership.data === "inactive") redirect("/accesso-sospeso");
  const { data: profile } = await db
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile) redirect("/app/agenda");
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Brand />
        <div className="mt-10 rounded-2xl border bg-white px-6 py-8 sm:p-10">
          <h1 className="text-3xl">Partiamo dal tuo studio.</h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Poche informazioni per aprire l’agenda. Potrai modificarle in
            seguito.
          </p>
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
