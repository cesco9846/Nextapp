"use client";
import { ErrorState } from "@/components/states";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <ErrorState
        error={
          new Error(
            "Non è stato possibile aprire questa pagina. Riprova oppure accedi di nuovo.",
          )
        }
        retry={reset}
      />
    </main>
  );
}
