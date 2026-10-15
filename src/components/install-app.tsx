"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/connectivity";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
function installed() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone
  );
}
function subscribeInstalled(listener: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  window.addEventListener("appinstalled", listener);
  return () => {
    media.removeEventListener("change", listener);
    window.removeEventListener("appinstalled", listener);
  };
}
const InstallContext = createContext<{
  prompt: InstallPrompt | null;
  clear: () => void;
} | null>(null);
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const finish = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", receive);
    window.addEventListener("appinstalled", finish);
    return () => {
      window.removeEventListener("beforeinstallprompt", receive);
      window.removeEventListener("appinstalled", finish);
    };
  }, []);
  return (
    <InstallContext.Provider value={{ prompt, clear: () => setPrompt(null) }}>
      {children}
    </InstallContext.Provider>
  );
}
export function InstallApp() {
  const online = useOnline();
  const standalone = useSyncExternalStore(
    subscribeInstalled,
    installed,
    () => false,
  );
  const installContext = useContext(InstallContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prompt = installContext?.prompt;
  async function install() {
    if (!prompt || !online) return;
    setBusy(true);
    setError("");
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setError(
        "Non è stato possibile aprire l’installazione. Usa il menu del browser.",
      );
    } finally {
      installContext?.clear();
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-7 border-t px-1 pt-7"
      aria-labelledby="install-title"
    >
      <h2 id="install-title" className="flex items-center gap-3 text-xl">
        <Smartphone className="size-5 text-primary" />
        Glow sul tuo dispositivo
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Apri Glow dalla schermata Home, come un’app. È sempre necessaria una
        connessione a Internet; agenda e documenti non vengono salvati per l’uso
        offline.
      </p>
      {standalone ? (
        <p className="mt-4 text-sm font-medium text-primary">
          Stai già usando Glow come app installata.
        </p>
      ) : (
        <>
          {prompt && (
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => void install()}
              disabled={busy || !online}
            >
              <Download />
              {busy ? "Apertura installazione…" : "Installa Glow"}
            </Button>
          )}
          <ul className="mt-4 max-w-2xl space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">
                iPhone e iPad:
              </strong>{" "}
              apri Glow in Safari, tocca Condividi e scegli «Aggiungi alla
              schermata Home».
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Android e computer:
              </strong>{" "}
              cerca «Installa app» o «Aggiungi alla schermata Home» nel menu del
              browser, quando disponibile.
            </li>
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
