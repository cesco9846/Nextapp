# Glow su Vercel

- App: https://glowlabs.it
- Vecchio URL: https://glow-phi-eosin.vercel.app → redirect permanente 308 al dominio canonico.
- Dashboard: https://vercel.com/francescoangiolini98-gmailcoms-projects/glow
- Progetto: `glow` (`prj_v5J1Oc43amxd1MKJU8MQdkYoIfkf`).
- Team: `team_yUX5Fj5mWKEDZNZI99Sgzb3X`.
- GitHub: `cesco9846/Nextapp`, production branch `main`.

Il progetto è stato creato separatamente dagli altri progetti Vercel il 16 ottobre
2026, con integrazione GitHub autorizzata alla repository. I push a `main`
avviano il deploy. Verificare sempre lo stato **READY** e lo SHA del nuovo
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
i redirect Auth. Il ramo `main` continua a distribuire normalmente.

Supabase Auth usa il dominio pubblico come Site URL e autorizza soltanto i callback
esatti `/auth/conferma`, `/auth/conferma?next=/nuova-password` e
`/auth/conferma?next=/invito`. Restano autorizzati gli equivalenti locali.
Conferma email obbligatoria; Auth SMTP ancora da configurare separatamente.
Reminder Resend/glowlabs.it ripresi in W16.a: chiave solo nel binding del worker,
mai nel browser. Il webhook richiede RESEND_WEBHOOK_SECRET sensitive/server-only
su Vercel, distinto dalla chiave invio; configurato e verificato.

Dominio glowlabs.it collegato e HTTPS attivo; DNS Register.it A216.198.79.1
riconosciuto da Vercel. Record email preservati. Site URL Supabase aggiornato,
con callback esatti sul nuovo dominio e precedenti localhost/Vercel conservati.
Webhook esistente Resend aggiornato dall’utente a
https://glowlabs.it/api/webhooks/resend; firme e callback dei simulatori verificati
senza fixture remote. Master reminder ancora OFF, scheduler/monitor da completare.
Auth SMTP rimane separato: servizio predefinito Supabase con limite2email/ora;
non è stato modificato per il rifiuto signup422 di password troppo corta.

## Pubblicazione e verifica

1. Test locali/CI con Supabase locale, senza fixture nel database ufficiale.
2. Migrazioni additive versionate con `scripts/migrate.py`; ledger/checksum
   ufficiale e riapplicazione idempotente, senza reset remoto.
3. Build, commit, push di `main` e tag checkpoint. Non lasciare chiavi nei diff.
4. Verificare GitHub Actions e deployment Vercel sul medesimo SHA.
5. Verificare via HTTPS health, accesso, manifest, pagine capability no-store e
   redirect/401 delle aree protette. Non inviare email o firme sintetiche in produzione.

La PWA è installabile e richiede rete. I PDF usano la coda persistente descritta
in [DOCUMENTS.md](DOCUMENTS.md); `after()` non sostituisce uno scheduler sempre
attivo. Prima del pilota completare worker/monitoraggio, email, dispositivi e
backup/restore del piano qualità.
