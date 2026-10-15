# Glow — punto di ripresa dello sviluppo

Checkpoint del 15 ottobre 2026. Questo file accompagna il primo salvataggio del
codice su GitHub e va aggiornato a ogni incremento. Non è un rilascio del pilota.

## Scelte confermate

- Nome prodotto: **Glow**. I nomi dei PDF originali e gli identificatori stabili
  delle migrazioni già applicate mantengono l’origine storica.
- Next.js 16, React 19, TypeScript, componenti shadcn/ui; calendario FullCalendar
  7.1.2 con tema Monarch ufficiale.
- Supabase ufficiale: `mexokvvvxdyekauupwvt`. Richieste applicative con sessione
  utente e RLS; nessuna chiave privilegiata nel browser.
- PWA installabile, **connessione necessaria**. Nessuna agenda offline, coda di
  scritture, sincronizzazione in background o snapshot persistente dei dossier.
- WhatsApp manuale: pulsante per aprire la chat con testo pronto. Nessun invio
  automatico né indicazione di consegna basata sulla sola apertura della chat.
- Skill frontend-design, impeccable e copywriting incluse in `.agents/skills`.

## Funzioni implementate

Accesso, registrazione, conferma email, recupero password, onboarding studio;
clienti con ricerca, scheda, modifica e archivio; sedi e servizi; agenda in quattro
viste con creazione/modifica/stati, conflitti e controllo versioni; WhatsApp;
report mensile delle sedute completate riservato alla titolare.

Il secondo incremento aggiunge inviti alle operatrici con link condiviso
manualmente (72 ore, token casuale conservato nel database solo come hash),
accettazione con email verificata, revoca degli inviti, sospensione/riattivazione
dei membri e assegnazioni cliente. Nessuna email di invito viene spedita dall’app.
Un account appartiene a un solo studio; il titolare non è sospendibile tramite
questo flusso. L’accesso clinico richiederà sia abilitazione sia assegnazione
attiva; le schermate cliniche non sono ancora implementate.

La sospensione blocca le richieste successive; l’interfaccia aggiorna lo stato
accessi periodicamente e rimuove la cache in memoria quando riceve la revoca.
La riattivazione non ripristina le vecchie assegnazioni. Gli errori temporanei
nell’aggiornamento dello studio conservano i moduli già aperti. Una risposta di
prenotazione persa viene dichiarata incerta: il retry esplicito usa la stessa
chiave per evitare duplicazioni. Le scritture offline falliscono senza accodarsi.

## Verifiche eseguite su questo checkpoint

- Lint, controllo TypeScript e build di produzione con configurazione ufficiale superati.
- 10 test unitari superati.
- 112 asserzioni pgTAP su due file superate con Supabase locale.
- 14 scenari Chromium superati su una build di produzione isolata `.next-e2e`.
  Comprendono isolamento tra tenant, concorrenza, autenticazione con vere email
  catturate dal server SMTP locale, flusso team, sospensione, perdita di rete e
  retry dopo perdita della risposta di prenotazione.
- Migrazioni locali 001–004 riapplicate tramite runner senza divergenza checksum.
- Ledger remoto controllato in sola lettura: contiene **soltanto 001 e 002**.

Le fixture rimangono locali. I test non dimostrano consegna email in produzione,
installazione fisica iOS/Android, comportamento su tutti i browser o correttezza
di funzioni ancora pianificate. Il workflow GitHub Actions è incluso; il suo
esito remoto va controllato dopo il push, senza dedurlo dai risultati locali.

## Differenza tra repository e database ufficiale

| Migrazione                            | Codice salvato | Database locale     | Supabase ufficiale |
| ------------------------------------- | -------------- | ------------------- | ------------------ |
| 202610150001 — schema base            | Sì             | Applicata           | Applicata          |
| 202610150002 — report completati      | Sì             | Applicata           | Applicata          |
| 202610150003 — team e accessi         | Sì             | Applicata e testata | **Da applicare**   |
| 202610150004 — guardie di concorrenza | Sì             | Applicata e testata | **Da applicare**   |

Il database ufficiale ha quindi ancora otto tabelle pubbliche con RLS. Il flusso
team richiede il rollout delle due nuove migrazioni. Non modificare i file già
applicati; usare il runner con ledger, checksum, lock e transazione.

## Riprendere da qui, nell’ordine

1. Completare la revisione grafica del team: la prima revisione ha richiesto
   selezione attiva di “Il tuo studio”/breadcrumb “Team” e rimozione del titolo
   duplicato nel login incorporato dell’invito. Le due correzioni sono già nel
   codice. Ricatturare le cinque viste con `scripts/capture-team-ui.ts` dopo la
   build E2E e ottenere il verdetto finale. Contratto in
   `.impeccable/surfaces/team.md`; sistema visivo in `DESIGN.md`.
2. Ricreare il database **locale** da zero e verificare tutte le migrazioni e i
   test sul reset, per chiudere anche questa prova del secondo incremento.
3. Applicare 003/004 al progetto ufficiale con il runner sotto; verificare ledger,
   RLS e assenza di fixture remote. Non eseguire reset o test sintetici sul remoto.
4. Aggiungere ai redirect Auth autorizzati il callback canonico
   `/auth/conferma?next=/invito`, preservando quelli esistenti. Conferma email
   obbligatoria; SMTP personalizzato ancora da configurare e collaudare.
5. Ricompilare e riavviare il server dell’ambiente con configurazione ufficiale;
   verificare health, login, manifest, invito e risposte API senza sessione.
   I processi esistenti potrebbero eseguire una build precedente al checkpoint.
6. Proseguire W10: Storage privato e ciclo upload/finalizzazione/pulizia. Poi
   modelli consenso, anamnesi, lotti pigmenti, link cliente, firma/PDF e foto
   (W11–W14). Il worker email W15 può avanzare in parallelo secondo il piano.

Restano inoltre da completare i collaudi browser estesi di archivio/omonime,
drag/resize e stati, installazione HTTPS su dispositivi reali, provider email,
export/retention, backup/ripristino, ICS, push e funzioni commerciali. Il dettaglio
con dipendenze e criteri di accettazione è in `IMPLEMENTATION_PLAN.md`.

## Comandi di ripresa

Dalla radice del repository, con Node 24, npm, Python 3 e Docker per i test locali:

```sh
npm ci
python3 scripts/configure-public-env.py
npm run db:start
npm run db:migrate:local
npm run test:db
npm run test:e2e
npm run lint
npm run typecheck
npm run test:unit
```

Nel cloud impostare `npm_config_cache=/workspace/.cache/npm` e
`PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`. Per usare Impeccable:
`IMPECCABLE_HOME=/workspace/.cache/impeccable`. Non creare un worktree aggiuntivo
senza richiesta: usare il checkout esistente. Per il reset delle sole fixture
locali: `npm run db:reset`.

Applicazione remota, dopo i controlli indicati:

```sh
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt --apply
```

Per il server: `npm run dev`, oppure `npm run build` seguito da `npm run start`.
Non dare per persistenti i processi dopo il ripristino dell’ambiente cloud.

## Cosa viene conservato e cosa resta esterno

GitHub conserva codice, quattro migrazioni, test, lockfile, skill, specifiche,
sistema visivo e questo checkpoint. `.env.local`, credenziali, database locale,
dipendenze installate, build, log e screenshot di test sono esclusi da Git.
Le credenziali restano nelle variabili sicure dell’ambiente: non copiarle nel
repository. Un nuovo ambiente deve ricevere gli stessi binding in modo sicuro.

La pubblicazione GitHub non distribuisce automaticamente l’app su un dominio e
non applica le migrazioni a Supabase. Hosting, dominio e configurazione SMTP
rimangono attività distinte. Non considerare questo checkpoint pronto per dati
clinici reali o per il pilota R1.
