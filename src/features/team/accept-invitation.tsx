"use client";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/connectivity";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
export function AcceptInvitation({
  email,
  verified,
}: {
  email: string | null;
  verified: boolean;
}) {
  const token = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
  const online = useOnline();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const display_name = String(
      new FormData(event.currentTarget).get("display_name") ?? "",
    );
    try {
      await api("/api/team/accept", {
        method: "POST",
        body: JSON.stringify({ token, display_name }),
      });
      window.history.replaceState(null, "", "/invito");
      window.location.replace(
        new URL("/app/agenda", window.location.origin).href,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Non è stato possibile accettare l’invito. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <Brand />
      <section className="mt-10 rounded-xl border bg-white p-6 sm:p-9">
        <h1 className="text-3xl">Unisciti al tuo studio</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Accedi con l’email a cui è destinato l’invito. Il collegamento vale 72
          ore e diventa inutilizzabile per altre persone dopo l’accettazione.
        </p>
        {!/^[a-f0-9]{64}$/.test(token) ? (
          <p role="status" className="mt-6 rounded-lg bg-secondary p-4 text-sm">
            Riapri il collegamento originale ricevuto dalla titolare per
            continuare.
          </p>
        ) : !email ? (
          <div className="mt-8">
            <AuthForm destination="/invito" />
          </div>
        ) : (
          <>
            <p className="mt-6 break-all text-sm">
              Hai effettuato l’accesso come <strong>{email}</strong>.
            </p>
            {!verified ? (
              <p role="status" className="mt-5 text-sm">
                Conferma prima l’email del tuo account, poi riapri questo
                invito.
              </p>
            ) : (
              <form className="mt-6 space-y-5" onSubmit={accept}>
                <div className="field">
                  <Label htmlFor="invitation-name">Come ti chiami?</Label>
                  <Input
                    id="invitation-name"
                    name="display_name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy || !online}>
                  {busy ? "Ingresso nello studio…" : "Accetta invito"}
                </Button>
              </form>
            )}
            <div className="mt-5">
              <SignOutButton />
            </div>
          </>
        )}
        {!online && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Connessione assente. Riconnettiti per continuare.
          </p>
        )}
      </section>
    </main>
  );
}
