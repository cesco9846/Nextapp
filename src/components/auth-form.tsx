"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { browserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AuthForm({
  recovery = false,
  destination = "/app/agenda",
  initialError = "",
}: {
  recovery?: boolean;
  destination?: "/app/agenda" | "/invito";
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  function nextPath() {
    return destination === "/invito"
      ? `/invito${/^[a-f0-9]{64}$/.test(window.location.hash.slice(1)) ? window.location.hash : ""}`
      : "/app/agenda";
  }
  function enter(path: string) {
    if (destination === "/invito" && window.location.pathname === "/invito") {
      // Read the new session in a new document, retaining the secret fragment.
      window.location.reload();
      return;
    }
    router.replace(path);
    router.refresh();
  }
  const changeMode = (value: string) => {
    if (["login", "signup", "reset"].includes(value))
      setMode(value as typeof mode);
    setError("");
    setMessage("");
  };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const db = browserSupabase();
    try {
      if (recovery) {
        const { error } = await db.auth.updateUser({ password });
        if (error)
          throw new Error(
            "Il collegamento non è più valido. Richiedi un nuovo recupero password.",
          );
        setMessage("Password aggiornata. Puoi tornare alla tua agenda.");
        enter(nextPath());
      } else if (mode === "login") {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error)
          throw new Error(
            "Non è stato possibile accedere. Controlla email e password e verifica di aver confermato l'email.",
          );
        enter(nextPath());
      } else if (mode === "signup") {
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/conferma${destination === "/invito" ? "?next=/invito" : ""}`,
          },
        });
        if (error)
          throw new Error(
            "Non è stato possibile creare l'account. Controlla i dati o riprova tra poco.",
          );
        if (data.session) {
          enter(destination === "/invito" ? nextPath() : "/configurazione");
        } else
          setMessage(
            destination === "/invito"
              ? "Controlla la tua email per confermare l’account, poi riapri il collegamento di invito originale."
              : "Controlla la tua email: ti abbiamo inviato il collegamento per confermare l'account.",
          );
      } else {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/conferma?next=/nuova-password`,
        });
        if (error)
          throw new Error(
            "Non è stato possibile inviare la richiesta. Riprova tra poco.",
          );
        setMessage(
          "Se l'indirizzo è associato a un account, riceverai il collegamento per scegliere una nuova password.",
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "La connessione non è riuscita. Riprova.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="w-full max-w-[380px]">
      {(destination !== "/invito" || recovery) && (
        <>
          <h1 className="text-[32px] leading-tight">
            {recovery
              ? "Scegli la nuova password"
              : mode === "reset"
                ? "Recupera il tuo accesso"
                : mode === "signup"
                  ? "Fai spazio al tuo studio"
                  : "Bentornata nel tuo studio"}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {recovery
              ? "Usa almeno 10 caratteri per proteggere il tuo account."
              : mode === "reset"
                ? "Ti invieremo un collegamento per scegliere una nuova password."
                : "La tua agenda, le tue clienti e le tue sedi, nello stesso posto."}
          </p>
        </>
      )}
      {!recovery && mode !== "reset" && (
        <Tabs
          value={mode}
          onValueChange={changeMode}
          className={destination === "/invito" ? "mt-0" : "mt-7"}
        >
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="login">Accedi</TabsTrigger>
            <TabsTrigger value="signup">Crea account</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <form onSubmit={submit} className="mt-7 space-y-5">
        {!recovery && (
          <div className="field">
            <Label htmlFor="email">Email professionale</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="nome@studio.it"
              maxLength={254}
            />
          </div>
        )}
        {(recovery || mode !== "reset") && (
          <div className="field">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "signup" || recovery
                    ? "new-password"
                    : "current-password"
                }
                minLength={mode === "signup" || recovery ? 10 : 1}
                required
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                aria-label={
                  showPassword ? "Nascondi password" : "Mostra password"
                }
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                Almeno 10 caratteri.
              </p>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm leading-relaxed text-destructive"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="rounded-lg bg-secondary p-4 text-sm leading-relaxed text-primary"
          >
            {message}
          </p>
        )}
        <Button className="w-full" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          {recovery
            ? "Aggiorna password"
            : mode === "login"
              ? "Accedi al tuo studio"
              : mode === "signup"
                ? "Crea il tuo account"
                : "Invia collegamento"}
          {!pending && <ArrowRight className="ml-auto" />}
        </Button>
      </form>
      {!recovery && (
        <Button
          variant="link"
          className="mt-4 w-full text-sm text-muted-foreground"
          onClick={() => changeMode(mode === "reset" ? "login" : "reset")}
        >
          {mode === "reset"
            ? "Torna all'accesso"
            : "Hai dimenticato la password?"}
        </Button>
      )}
      {recovery && (
        <Button variant="link" asChild className="mt-4 w-full">
          <Link href="/accedi">Torna all’accesso</Link>
        </Button>
      )}
    </div>
  );
}
