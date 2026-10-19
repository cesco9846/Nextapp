# Esecuzione programmata dei promemoria — W16.c

Due job Supabase Cron indipendenti, ogni minuto, chiamano tramite pg_net le
funzioni Node di Vercel sul dominio canonico:

- `glow-reminder-worker` → `POST /api/internal/reminders/run`, massimo 60 secondi.
- `glow-reminder-monitor` → `POST /api/internal/reminders/monitor`, massimo 15 secondi.

Il worker usa l’outbox W15 e Resend W16.a: massimo tre lavori per richiesta,
budget di avvio 35 secondi, timeout provider 8 secondi e singola RPC 3 secondi.
Il limite Vercel è il timeout esterno effettivo. Un arresto dopo il confine di
invio lascia una lease da riconciliare, senza un nuovo invio cieco. In loopback
la route non può usare il trasporto reale, anche se eredita una chiave Resend.
Il CLI locale continua a offrire il provider simulato.

## Autenticazione e registri

La chiave casuale di 256 bit è conservata in Supabase Vault con nome
`glow_reminder_runner` e nella variabile server-only Vercel
`REMINDER_RUNNER_SECRET`. Non viene inserita nella coda HTTP o nel comando cron.
pg_net è un’estensione gestita dal provider e può conservare grant PUBLIC sui
propri oggetti: la riservatezza della chiave non dipende da quei grant.

Ogni richiesta usa HMAC-SHA256 su `tipo + newline + secondi Unix + newline + UUID`.
Header `X-Glow-Time`, `X-Glow-Nonce`, `X-Glow-Signature`; finestra di 90 secondi,
confronto costante e nonce consumato atomicamente attraverso RPC service-only.
Firma di un tipo non valida per l’altro; replay e richieste scadute respinti.
Body limitato a 64 byte e oggetto vuoto: il chiamante non può cambiare studio,
provider, interruttori o dimensione del batch. I cookie professionali vengono
ignorati. Risposte `no-store`, nessun segreto o dato cliente nei log.

La funzione amministrativa `app_private.enqueue_reminder_runner` usa URL fisso,
attende al massimo 65 secondi nel trasporto e non tiene lock durante la rete:
pg_net inizia la richiesta dopo il commit. Non accoda una seconda chiamata dello
stesso tipo finché la prima è pendente; dopo 90 secondi registra il timeout.
Le invocazioni conservano soltanto ID, tipo, orari e HTTP status per sette giorni;
i nonce si eliminano dopo dieci minuti, oltre la finestra di autenticazione.
Metadati e nonce sono privati/RLS, senza grant ordinari.

Il monitor persiste/risolve gli allarmi W15. HTTP 503 per salute degradata o
indisponibilità, 200 per salute ok o sospensione intenzionale. La sola riuscita
del comando cron prova l’accodamento, non l’esito HTTP: controllare anche le
risposte e le invocazioni. Una richiesta interrotta resta riconoscibile.

## Configurazione, verifica e arresto

Dopo migrazioni e collaudo locale, con i binding sicuri già presenti:

```sh
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --configure
# Pubblicare il codice: la configurazione delle variabili richiede un nuovo deploy.
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --probe
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --schedule
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --status
node --use-env-proxy --import tsx scripts/reminder-scheduler.ts --project-ref mexokvvvxdyekauupwvt --pause
```

Configure riusa una chiave valida già presente, senza stamparla né ruotarla
silenziosamente; distribuisce anche la chiave Resend server-only. Probe e schedule
richiedono il master disattivato, verificano entrambe le route e zero claim/invii.
Schedule crea/aggiorna soltanto i due job nominati. Pause li rimuove senza toccare
altri job o dichiarare richiamata una richiesta in volo. Per fermare gli invii
anche nelle richieste successive, l’operatore deve disattivare il master W15.

## Limiti e prossimo gate

Per scelta esplicita dell’utente, questo incremento **non invia notifiche email
tecniche**. Gli allarmi sono consultabili tramite CLI, API riservata e registri
operativi. Non è presente un monitor esterno indipendente da Supabase/Vercel:
un guasto a entrambi non può notificarsi da solo. Canale esterno, prova di
reperibilità/restore, retention dei run cron e collaudo operativo con consegne
autorizzate restano prima dell’abilitazione reale. Il master resta OFF.
SMTP Auth, runner PDF e pulizia file sono lavori separati.

Fonti: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[Vault](https://supabase.com/docs/guides/database/vault).
