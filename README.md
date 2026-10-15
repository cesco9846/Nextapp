# Glow

Web app per organizzare clienti, sedi, servizi e appuntamenti di uno studio.
Next.js 16, React 19, TypeScript strict, shadcn/ui e FullCalendar 7 con tema
Monarch ufficiale. Database e autenticazione: Supabase.

## Incremento disponibile

- Accesso, registrazione, recupero password e configurazione iniziale dello studio.
- Clienti con ricerca/paginazione, scheda, storico, modifica e archivio.
- Catalogo servizi e sedi; conservazione del prezzo e nome servizio prenotati.
- Agenda giorno/settimana/mese/lista, filtri, prenotazione, spostamento,
  modifica durata e stato, annullamento e gestione dei conflitti.
- Pulsante WhatsApp con numero internazionale e messaggio predisposto.
- Riepilogo mensile del valore delle sedute completate, riservato al titolare.
- Team: inviti tramite link, accettazione con email verificata, sospensione/riattivazione
  e assegnazioni cliente. Schema applicato anche al progetto ufficiale.
- API per file immagine privati, verifica/normalizzazione, URL brevi e pulizia
  recuperabile. La schermata foto arriverà con il relativo incremento.
- Consensi/questionari con versioni pubblicate immutabili; catalogo pigmenti,
  lotti, scadenze ed etichette private. Preparazione non firmata dell’appuntamento
  con risposte anamnestiche auditate e snapshot dei lotti scelti.
- Interfaccia responsive, manifest con icone e istruzioni di installazione PWA.
  Richiede Internet; nessuna coda di modifiche o consultazione offline.

Sono ancora da realizzare compilazione cliente, firma/PDF, foto,
invio email e worker, link cliente,
export/retention, ICS e funzioni commerciali. I reminder email restano disattivati;
aprire WhatsApp non registra un invio. Non è ancora il pilota R1.

Il punto esatto da cui riprendere, le verifiche e le attività ancora aperte sono
in [DEVELOPMENT_CHECKPOINT.md](DEVELOPMENT_CHECKPOINT.md).

## Avvio

Prerequisiti: Node 24 (file `.node-version`), npm, Python 3. Docker serve solo
per il database e i test locali. Dalla radice del repository:

Nel cloud la home non è scrivibile: prima dei comandi npm impostare
`export npm_config_cache=/workspace/.cache/npm`. Gli script salvati nell'ambiente
lo fanno già; su una macchina propria si può usare la cache npm predefinita.

```sh
npm ci
python3 scripts/configure-public-env.py
npm run dev
```

Il configuratore preserva un eventuale `.env.local` esistente. Quando manca,
recupera dalla Management API solo la chiave pubblica del progetto ufficiale
`mexokvvvxdyekauupwvt`, usando `Nextapp_token_access` già fornito nelle impostazioni
sicure dell'ambiente. L'alternativa è copiare `.env.example` in `.env.local` e
inserire la **publishable key**, mai una chiave privilegiata.

Variabili pubbliche: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL` (origine canonica).
Le chiavi `supabase_secret`, `supabase_service_role_secret` e il PAT
`Nextapp_token_access` rimangono nel sistema di gestione dei segreti. Il normale
codice applicativo usa la sessione utente e la RLS, senza bypass con service role.
Nessun segreto va incollato in chat, nei file versionati o nei log.

Prima di usare un dominio distribuito, impostare la sua origine canonica e
autorizzare i redirect Supabase Auth verso `/auth/conferma` e il recupero password.
SMTP, consegna email e redirect sul dominio finale richiedono verifica reale.
Sul progetto ufficiale sono già autorizzati i callback di sviluppo verso
`http://localhost:3000/auth/conferma`, il recupero password e l’accettazione
degli inviti. Conferma email obbligatoria, password minima dieci caratteri;
SMTP personalizzato non ancora configurato.

## Database ufficiale

Migrazioni versionate in `supabase/migrations`, con un unico runner locale/remoto:

```sh
# Mostra il piano, senza applicarlo
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt
# Applica i nuovi file in ordine, sotto lock e transazione
python3 scripts/migrate.py --project-ref mexokvvvxdyekauupwvt --apply
```

Il ledger privato `app_private.schema_migrations` conserva versione e SHA-256.
Una seconda applicazione non modifica i dati; un checksum diverso viene respinto.
Non modificare migrazioni già applicate: aggiungere un nuovo file. Non utilizzare
`supabase db push` come secondo percorso con un ledger divergente.

Il 15 ottobre 2026 sono state applicate e ri-verificate le undici migrazioni
`202610150001`–`202610150011` al progetto ufficiale dopo le prove locali.
Diciassette tabelle pubbliche con RLS e bucket privato `glow-private`; nessun dato o
oggetto sintetico creato nel remoto. Team e base Storage sono disponibili nello
schema ufficiale, insieme a modelli, pigmenti e preparazioni. Le risposte
anamnestiche restano nello schema privato, leggibili solo con RPC auditata.
Contratti, limiti e pulizia in [STORAGE.md](STORAGE.md).
Firme, PDF e foto prima/dopo riceveranno i flussi specifici nei prossimi incrementi.

## Test isolati

I test d'integrazione usano esclusivamente Supabase locale: il runner rifiuta
URL non loopback. La chiave amministrativa locale serve solo a predisporre
identità sintetiche; le operazioni testate usano sessioni normali.

```sh
npm run db:start
npm run db:migrate:local
npm run test:db
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install chromium
npm run test:e2e
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Fuori dal cloud, si può impostare `PLAYWRIGHT_BROWSERS_PATH` su una propria cache
scrivibile sia nell'installazione sia nei test. Il default dei runner è
`../.cache/ms-playwright` rispetto al repository. Il browser Chromium richiede
le proprie dipendenze di sistema; in CI viene installato con `--with-deps`.

`test:e2e` compila una build di produzione separata (`.next-e2e`) con le sole
credenziali locali, avvia il server di test e lo arresta al termine. La build di
sviluppo/produzione normale conserva la configurazione ufficiale in `.next`.
Questo evita interferenze del ricaricamento automatico e delle variabili pubbliche.

Per ricreare **solo il database locale di test**, `npm run db:reset`; elimina
le fixture locali e riapplica le migrazioni. Non eseguire reset sul progetto
ufficiale. `npm run db:types` rigenera i tipi dopo una migrazione locale.
I test pgTAP si chiudono con rollback; quelli browser creano fixture locali
con indirizzi `.invalid`. Il server SMTP locale cattura le email senza recapitarle.

L'avvio usa le immagini Supabase slim e la configurazione CLI nella cache
scrivibile del progetto. Nel cloud, BusyBox ignora `NO_PROXY`: l'helper corregge
soltanto le sonde HTTP verso loopback di Auth/Storage. Proxy esterno, verifiche
TLS e health check restano attivi. `npm run db:start` non stampa le chiavi locali.
Per arrestare lo stack: `node scripts/supabase.mjs stop`.

## Qualità e sviluppo continuo

La pipeline è definita in [.github/workflows/ci.yml](.github/workflows/ci.yml):
lockfile, lint, unit, migrazioni ripetute, pgTAP, browser su build reale e tipi.
L'esecuzione GitHub Actions va verificata dopo il primo push; i comandi sono
stati eseguiti in questo ambiente, non è dichiarato un run remoto inesistente.

Vedere [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) per stato, dipendenze e
prossimo incremento; [SPEC.md](SPEC.md), [DATA_MODEL.md](DATA_MODEL.md) e
[QUALITY_PLAN.md](QUALITY_PLAN.md) per requisiti e criteri di rilascio.

Le skill locali sono in `.agents/skills`: frontend-design, impeccable,
copywriting. Per il launcher Impeccable nel cloud impostare
`IMPECCABLE_HOME=/workspace/.cache/impeccable`. Il sistema visivo è documentato
in [DESIGN.md](DESIGN.md); icone prodotto in SVG originale, PNG derivati con Sharp.
Gli screenshot con fixture locali si rigenerano, dopo `npm run test:e2e`, con:

```sh
node --use-env-proxy --import tsx scripts/capture-ui.ts
node --use-env-proxy --import tsx scripts/capture-clinical-ui.ts
```

Le catture e i risultati dei test sono ignorati da Git. Nessun servizio worker,
invio email reale, hosting o abbonamento viene attivato da questi comandi.

Le opzioni per mittente e risposte ai reminder sono documentate in
[EMAIL_DELIVERY.md](EMAIL_DELIVERY.md): dominio Glow verificato e Reply-To dello
studio è la proposta iniziale, ancora da confermare prima di attivare il provider.
