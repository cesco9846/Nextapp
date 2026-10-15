import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5">
      <h1 className="text-3xl">Pagina non trovata</h1>
      <p className="text-muted-foreground">
        Il collegamento potrebbe essere cambiato.
      </p>
      <Button asChild>
        <Link href="/app/agenda">Torna all’agenda</Link>
      </Button>
    </main>
  );
}
