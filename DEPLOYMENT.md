# Glow su Vercel

- App: https://glowlabs.it
- Vecchio URL: https://glow-phi-eosin.vercel.app → redirect permanente 308 al dominio canonico.
- Dashboard: https://vercel.com/francescoangiolini98-gmailcoms-projects/glow
- Progetto: `glow` (`prj_v5J1Oc43amxd1MKJU8MQdkYoIfkf`).
- Team: `team_yUX5Fj5mWKEDZNZI99Sgzb3X`.
- GitHub: `cesco9846/Nextapp`, production branch `main`.

Il progetto è stato creato separatamente dagli altri progetti Vercel il 16 ottobre
2026, con integrazione GitHub autorizzata alla repository. I push a `main` avviano Application checks; il deployment viene richiesto
solo dopo la riuscita dello stesso SHA dal workflow Checked production deployment.
L’autodeploy Git indipendente è disabilitato da `vercel.json`. Verificare sempre lo stato **READY** e lo SHA del nuovo
deployment; un push GitHub non prova da solo la pubblicazione dell’app.

## Configurazione

Preset Next.js, Node 24.x, root repository, installazione `npm ci`, build
`npm run build`, regione funzioni `dub1` vicina a Supabase `eu-west-1`.
Le funzioni firma/rigenerazione PDF hanno `maxDuration=60`.

Variabili production configurate su Vercel, senza valori nei file versionati:

- `NEXT_PUBLIC_SUPABASE_URL`: progetto ufficiale `mexokvvvxdyekauupwvt`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chiave pubblica dello stesso progetto.
- `NEXT_PUBLIC_APP_URL`: `https://glowlabs.it`.
- `supabase_service_role_secret`: credenziale server, tipo **sensitive**.
- `RESEND_WEBHOOK_SECRET`: firma webhook, tipo **sensitive**, solo production.

PAT Supabase e token Vercel restano nell’ambiente di sviluppo: non servono al
runtime dell’app. Non passarli a variabili `NEXT_PUBLIC_*`, argomenti, log o Git.
La chiave server serve solo ai moduli server-only dedicati a Storage/capability/PDF;
le normali operazioni dello studio usano la sessione utente e RLS.

I preview deploy sono disabilitati in questo progetto: origine canonica,
redirect e database ufficiale sono configurati per il dominio sopra. Prima di
attivarli definire domini e credenziali di staging, senza allargare indiscriminatamente
i redirect Auth. Il ramo `main` viene distribuito tramite il gate CI descritto sotto.

Supabase Auth usa il dominio pubblico come Site URL e autorizza soltanto i callback
esatti `/auth/conferma`, `/auth/conferma?next=/nuova-password` e
`/auth/conferma?next=/invito`. Restano autorizzati gli equivalenti locali.
Conferma email obbligatoria. SMTP Auth è configurato su Resend dal completamento
W17, mittente Glow <reminder@glowlabs.it>, limite configurato 20/ora (non è la
quota totale del piano Resend). Accesso e reset ricevuti nella posta in arrivo,
confermati dall’utente; non ripetere invii di prova senza autorizzazione.

Dominio glowlabs.it collegato e HTTPS attivo; DNS Register.it riconosciuto da
Vercel, record email preservati. Webhook Resend:
https://glowlabs.it/api/webhooks/resend, firma sensitive/server-only.
Reminder e manutenzione sono **attivi**; configurazioni e probe in
[REMINDER_SCHEDULER.md](REMINDER_SCHEDULER.md) e
[OPERATIONS_AUTOMATION.md](OPERATIONS_AUTOMATION.md).
Per scelta utente gli alert tecnici via email attendono la casella dedicata.

## Gate CI del 29 ottobre 2026

`deploy.yml` accetta solo Application checks completato con successo da push
sul main della repository cesco9846/Nextapp. Verifica provenienza prima del
checkout e ricontrolla SHA/evento/stato prima di chiamare Vercel. Il commit deve
coincidere con main; PR, fork, CI fallita o commit superato non vengono promossi.
`gitSource.ref` e `sha` sono fissati al commit verificato. Nessuna pubblicazione
del branch in movimento. Job serializzato; verifica READY e SHA conclusiva.

Prerequisito: Actions secret `VERCEL_TOKEN` nella repository, con accesso al
progetto Vercel. Il token presente in questo workspace non viene copiato
implicitamente su GitHub. L’integrazione della chat non dispone dei permessi
Secrets (403); finché il secret manca, usare dal workspace autenticato:

```sh
node --use-env-proxy --import tsx scripts/deploy-checked.ts <successful-main-run-id>
```

La stessa verifica blocca il deploy se CI è rossa. Non riattivare l’autodeploy
per aggirarla. Un workflow dispatch deve riferirsi a un run main verificato.
Prima di configurare staging remoto: progetto Supabase, domini callback,
segreti, scheduler e destinatari separati; le attuali guardie di progetto non
vanno rimosse per far funzionare un preview contro produzione.

## Pubblicazione e verifica

1. Test locali/CI con Supabase locale, senza fixture nel database ufficiale.
2. Migrazioni additive versionate con `scripts/migrate.py`; ledger/checksum
   ufficiale e riapplicazione idempotente, senza reset remoto.
3. Build, commit, push di `main` e tag checkpoint. Non lasciare chiavi nei diff.
4. Attendere CI verde, avviare il deploy verificato (workflow o script) e
   controllare Vercel READY sul medesimo SHA.
5. Verificare via HTTPS health, accesso, manifest, pagine capability no-store e
   redirect/401 delle aree protette. Non inviare email o firme sintetiche in produzione.

La PWA è installabile e richiede rete. I PDF usano la coda persistente descritta
in [DOCUMENTS.md](DOCUMENTS.md); `after()` non sostituisce uno scheduler sempre
attivo. Worker, SMTP e scheduler sono operativi. Prima del pilota completare
monitor indipendente, dispositivi, backup/restore e gate privacy; produzione
prevista sul VPS Hostinger secondo STABILIZATION_PLAN.md, non ancora configurato.

## Runner e monitor W16.c

Due route Node con richieste HMAC scadenti e nonce monouso, attivate da
Supabase Cron ogni minuto tramite pg_net. Variabili production sensitive
`REMINDER_RUNNER_SECRET` e `RESEND_API_KEY`; nessuna nel bundle browser.
La chiave di firma è anche in Vault, mai nel comando cron o nella coda HTTP.
Credenziali, prova con invii disattivati, avvio/arresto dei soli job Glow e
controllo delle risposte in [REMINDER_SCHEDULER.md](REMINDER_SCHEDULER.md).
Per scelta utente, nessuna notifica email tecnica. L’esecuzione del monitor
non sostituisce un allarme esterno indipendente o il collaudo prima del pilota.
