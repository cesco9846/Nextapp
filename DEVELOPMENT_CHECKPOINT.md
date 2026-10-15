# Glow — punto di ripresa dello sviluppo

Aggiornato il 15 ottobre 2026: **team migrato e base Storage privata verificata**.
La riconciliazione recupera anche scritture terminate dopo un primo cleanup.
Il primo checkpoint resta nel tag `checkpoint-2026-10-15`; questo documento su
`main` descrive lo stato più recente. Non è ancora il pilota R1.

## Scelte confermate

Nome Glow; Next.js/React/TypeScript; shadcn/ui originale; FullCalendar 7.1.2
Monarch; Supabase ufficiale `mexokvvvxdyekauupwvt`. PWA installabile con
**connessione necessaria**, senza agenda offline, snapshot persistenti o coda di
scritture. WhatsApp manuale con chat/testo pronti, senza consegna dichiarata.
Skill frontend-design, impeccable e copywriting conservate in `.agents/skills`.

## Funzioni implementate

Auth SSR, registrazione/conferma/recupero, onboarding studio; clienti con ricerca,
modifica e archivio; sedi/servizi; agenda giorno/settimana/mese/lista, stati,
conflitti, versioni e idempotenza; WhatsApp; report sedute completate per titolare.

Team: inviti manuali tramite link di 72 ore, email verificata, revoca inviti,
sospensione/riattivazione, assegnazioni cliente. Un account per studio, nessuna
promozione autonoma o sospensione della titolare. Per accesso clinico delle
operatrici servono abilitazione e assegnazione attive; la riattivazione non
ripristina assegnazioni revocate. UI senza duplicazione del titolo nell’invito,
navigazione Team corretta; cinque catture confermate, verdetto `ship` e
confronto documenter senza modifica del sistema visivo.

Nuovo W10: API file immagine con bucket privato, upload temporaneo, controllo
hash/dimensione/formato, limite 20 MP, ricodifica senza EXIF/GPS, oggetto finale
immutabile, lettura auditata con URL di 30 secondi, job di pulizia con lease e
retry. La creazione di token di upload firmato è vietata: sopravviverebbero alle
verifiche successive di revoca/pulizia. Contratti completi in [STORAGE.md](STORAGE.md).
**La schermata foto, le categorie e i consensi d’uso non sono ancora implementati.**

## Database ufficiale e runtime

Tutte e sette le migrazioni `202610150001`–`202610150007` sono applicate e
ri-verificate con checksum; undici tabelle pubbliche con RLS. Bucket
`glow-private` privato; inventario ufficiale senza clienti, appuntamenti, file o
oggetti di prova. Nessuna suite sintetica è stata eseguita sul progetto remoto.

Auth autorizza callback di sviluppo, recupero password e
`/auth/conferma?next=/invito`; conferma email obbligatoria, password minima dieci
caratteri. SMTP personalizzato e dominio definitivo ancora da configurare.
Server dell’ambiente ricompilato con configurazione ufficiale e avviato; health,
login, invito, manifest Glow e risposte 401 senza sessione verificate.
I processi non sopravvivono necessariamente al ripristino dell’ambiente.

## Verifiche dell’incremento

- Lint, controllo TypeScript e build di produzione superati; Sharp spostato fra
  le dipendenze runtime perché usato dal server.
- 10 test unitari e 141 asserzioni pgTAP su tre file superati.
- 18 scenari Chromium superati su build di produzione locale isolata. I quattro
  scenari Storage usano il servizio reale locale e sono ripetuti dopo il reset.
- Reset locale da zero con sette migrazioni e riapplicazione idempotente superati.
- Test token di upload firmato prima fallito, poi superato dopo la guardia 006.
- Migrazioni remote applicate e ripetute senza divergenza. Comando di pulizia
  remoto riuscito senza fixture, con zero claim.

Un problema del launcher CLI TSX nel cloud è stato isolato: non mantiene il flag
proxy nel processo figlio. Il comando verificato usa `node --use-env-proxy
--import tsx ...`, senza cambiare proxy, CA, TLS o credenziali. Non chiedere altri
segreti: entrambi i binding server esistenti funzionano.

GitHub Actions è definito; l’esito del run remoto va verificato separatamente.
I test locali non equivalgono a consegna SMTP reale, installazione fisica PWA,
backup/restore o collaudo completo dei flussi clinici.

## Prossime attività, nell’ordine

1. W11: modelli consenso/anamnesi versionati, pigmenti/lotti/etichette; usare la
   base Storage senza aprire un generico upload non autorizzato. Le firme e i PDF
   avranno un contratto specifico, distinto dagli upload fotografici.
2. W12: link cliente con scopo limitato, consumo POST atomico, scadenza/revoca e
   modalità tablet isolata. GET/scanner non devono cambiare dati.
3. W13: firma e snapshot immutabile, job PDF recuperabile senza rifirma.
4. W14: fotocamera/compressione, prima/dopo/guarito e consensi d’uso; dispositivi
   fisici, HEIC e qualità visiva da verificare prima di raccogliere immagini reali.
5. Configurare scheduler del job file sull’hosting scelto, con allarme sui ritardi.
   Al momento è eseguibile manualmente: nessun cron remoto attivo.

Restano W04 su dominio/SMTP reale, collaudi UI estesi di archivio/omonime e
agenda drag/resize/stati, email worker/provider W15–W17, installazione PWA HTTPS
su iOS/Android, export/retention, staging, backup/ripristino, ICS, push e funzioni
commerciali. Dipendenze e criteri sono in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
Nessun dato clinico reale prima dei relativi flussi, permessi e conservazione.

## Comandi di ripresa

Usare il checkout esistente; non creare un worktree senza richiesta. Node 24,
npm, Python 3; Docker per l’integrazione locale. Nel cloud impostare
`npm_config_cache=/workspace/.cache/npm`,
`PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`,
`IMPECCABLE_HOME=/workspace/.cache/impeccable`. Mantenere proxy e CA ereditati.

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
npm run build
npm run start
```

Il configuratore preserva `.env.local` e recupera solo configurazione pubblica.
I test rifiutano Supabase non loopback. `npm run db:reset` distrugge soltanto le
fixture locali: non eseguire reset/seed sul progetto ufficiale. Mai modificare
migrazioni applicate; usare nuovi file e il runner unico:

```sh
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt --apply
node --use-env-proxy --import tsx scripts/cleanup-files.ts --local
node --use-env-proxy --import tsx scripts/cleanup-files.ts --project-ref mexokvvvxdyekauupwvt
```

GitHub conserva codice, migrazioni, test, lockfile, skill, specifiche e checkpoint.
Credenziali, `.env.local`, database locale, build, dipendenze, log e screenshot
restano esclusi. Le credenziali vanno fornite tramite i binding sicuri dell’ambiente.
La pubblicazione del codice non distribuisce l’app su un dominio: hosting e
SMTP rimangono attività distinte. Non dichiarare completati R1 o il prodotto.
