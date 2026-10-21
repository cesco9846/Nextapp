import type { Metadata } from "next";
import { z } from "zod";
import { Brand } from "@/components/brand";
import { serverSupabase } from "@/server/supabase";
import { checkDb } from "@/server/http";

export const metadata: Metadata = {
  title: "Informativa dello studio | Glow",
  robots: { index: false, follow: false },
};
export default async function PrivacyNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = z.uuid().safeParse((await params).id);
  const db = await serverSupabase();
  const result = id.success
    ? await db.rpc("read_privacy_notice", { p_tenant_id: id.data })
    : { data: null, error: null };
  checkDb(result.error);
  const notice = z
    .object({
      studio: z.string(),
      notice: z.string(),
      contact_email: z.email(),
      version: z.number(),
      updated_at: z.string(),
    })
    .nullable()
    .parse(result.data);
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Brand />
      <article className="mt-10">
        <h1 className="text-[32px]">Informativa sul trattamento dei dati</h1>
        {notice ? (
          <>
            <p className="mt-3 text-lg">{notice.studio}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Versione {notice.version} · Aggiornata il{" "}
              {new Intl.DateTimeFormat("it-IT", {
                dateStyle: "long",
                timeZone: "Europe/Rome",
              }).format(new Date(notice.updated_at))}
            </p>
            <div className="mt-8 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {notice.notice}
            </div>
            <footer className="mt-10 border-t pt-6">
              <h2 className="text-lg">Contatto privacy</h2>
              <a
                className="mt-2 inline-flex min-h-11 items-center break-all text-sm underline underline-offset-4"
                href={`mailto:${notice.contact_email}`}
              >
                {notice.contact_email}
              </a>
            </footer>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            L’informativa per questo collegamento non è disponibile. Richiedi
            allo studio il testo aggiornato e il contatto per le richieste sui
            tuoi dati.
          </p>
        )}
      </article>
    </main>
  );
}
