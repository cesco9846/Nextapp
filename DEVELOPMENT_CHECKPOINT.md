# Glow — punto di ripresa dello sviluppo

Aggiornato il 15 ottobre 2026: **modelli clinici, pigmenti/lotti e preparazione non firmata implementati**.
Il catalogo e le risposte seguono permessi e audit distinti.
Il primo checkpoint resta nel tag `checkpoint-2026-10-15`; questo incremento
è conservato in `checkpoint-clinical-2026-10-15` e su `main`. Non è ancora il pilota R1.

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

W10: API file immagine con bucket privato, upload temporaneo, controllo
hash/dimensione/formato, limite 20 MP, ricodifica senza EXIF/GPS, oggetto finale
immutabile, lettura auditata con URL di 30 secondi, job di pulizia con lease e
retry. La creazione di token di upload firmato è vietata: sopravviverebbero alle
verifiche successive di revoca/pulizia. Contratti completi in [STORAGE.md](STORAGE.md).
**La schermata foto, le categorie e i consensi d’uso non sono ancora implementati.**

Nuovo W11: Il tuo studio → Consensi e pigmenti. La titolare pubblica versioni
immutabili di testi/questionari, registra pigmenti e lotti con scadenze ed
etichette private. Le operatrici cliniche consultano il catalogo. Dall’agenda si
apre la preparazione del trattamento, con le versioni dei modelli, risposte
anamnestiche e fino a 12 lotti. Lotti scaduti oggi o al giorno dell’appuntamento
sono respinti. Versioni e informazioni già scelte non vengono riscritte dalle
modifiche del catalogo. Richieste concorrenti usano versioni e idempotenza.

Le risposte rimangono nello schema privato, senza SELECT client; ogni lettura
registra prima un audit, anche se eseguita direttamente tramite RPC. Accessi
clinici e revoche condividono il lock tenant e ricontrollano i permessi dopo
l’attesa. Nel browser le risposte restano solo nello stato del form, senza cache
persistente o invio alla riconnessione. Lo stato è sempre bozza: firma, PDF e
compilazione della cliente sono i prossimi incrementi.

Email: [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md) documenta la proposta di un mittente
Glow su dominio verificato, nome studio e Reply-To verificato della professionista.
Noreply non è obbligatorio; Gmail/Outlook personale richiederebbe collegamenti
specifici per ogni account. Provider e modello dei mittenti non sono ancora
confermati; nessun account, dominio a pagamento o invio attivato.

## Database ufficiale e runtime

Tutte e undici le migrazioni `202610150001`–`202610150011` sono applicate e
ri-verificate con checksum; diciassette tabelle pubbliche con RLS; risposte anamnestiche private. Bucket
`glow-private` privato; inventario ufficiale senza clienti, appuntamenti, file o
oggetti di prova. Nessuna suite sintetica è stata eseguita sul progetto remoto.

Auth autorizza callback di sviluppo, recupero password e
`/auth/conferma?next=/invito`; conferma email obbligatoria, password minima dieci
caratteri. SMTP personalizzato e dominio definitivo ancora da configurare.
Server dell’ambiente ricompilato con configurazione ufficiale e avviato; health,
login, invito, manifest Glow e risposte 401 senza sessione verificate.
I processi non sopravvivono necessariamente al ripristino dell’ambiente.

## Verifiche dell’incremento

- Lint, controllo TypeScript e build di produzione superati; 10 test unitari.
- 176 asserzioni pgTAP su quattro file: nuovi controlli per pubblicazioni,
  snapshot, permessi, risposte e fallimento dell’audit prima della lettura.
- 24 scenari Chromium superati su build di produzione e Supabase locale reale.
  Due test bloccano richieste cliniche sul lock reale del tenant, revocano
  l’assegnazione e provano che letture/scritture in attesa vengano negate.
- Il percorso UI pubblica testi/domande, carica e legge un’etichetta, salva una
  preparazione. Il test a 375 px controlla due righe di schede, touch target
  almeno 44 px e ricerca senza sovrapposizione. Input offline mantenuto solo in
  memoria; nessun POST accodato, retry esplicito dopo riconnessione.
- Reset locale da zero con undici migrazioni, riapplicazione e checksum superati.
- Rollout ufficiale senza fixture; ledger e inventario verificati separatamente.
- Revisione Impeccable: otto catture desktop/telefono, una correzione dell’ingombro
  delle schede mobili e conferma finale. Evidenze in `.impeccable/surfaces/clinical.md`.
  Disposizione finale `ship` sulla correzione valutata; documenter senza modifiche
  a DESIGN.md/sidecar. Icone originali invariate, tre raster con provenienza verificata.

Il launcher CLI TSX non mantiene il flag proxy nel processo figlio. Usare
`node --use-env-proxy --import tsx ...`, senza cambiare proxy, CA, TLS o
credenziali. Entrambi i binding server esistenti funzionano.

GitHub Actions è definito; verificare il run del commit corrente dopo ogni push.
Il checkpoint precedente `388eadc` aveva entrambi i run remoti verdi. I test locali
non equivalgono a consegna SMTP reale, installazione fisica PWA, backup/restore o
collaudo completo dei flussi clinici.

## Prossime attività, nell’ordine

1. W12: link cliente con scopo limitato, consumo POST atomico, scadenza/revoca e
   modalità tablet isolata. GET/scanner non devono cambiare dati. Riutilizzare
   modelli pubblicati e preparazione; non esporre endpoint di anamnesi senza
   scopo, sessione o token limitato esplicito.
2. W13: firma e snapshot immutabile, job PDF recuperabile senza rifirma.
3. W14: fotocamera/compressione, prima/dopo/guarito e consensi d’uso; dispositivi
   fisici, HEIC e qualità visiva da verificare prima di raccogliere immagini reali.
4. W15–W17: worker outbox, provider e reminder, conferma/disdetta. W15 può
   procedere con adapter simulato; mittente/provider/DNS vanno confermati e
   provati entro W16, separatamente da Supabase Auth SMTP.
5. Configurare scheduler del job file sull’hosting scelto, con allarme sui ritardi.
   Al momento è eseguibile manualmente: nessun cron remoto attivo.

Restano W04 su dominio/SMTP reale, collaudi UI estesi di archivio/omonime e
agenda drag/resize/stati, installazione PWA HTTPS su iOS/Android, export/retention,
staging, backup/ripristino, ICS, push e funzioni commerciali. Dipendenze e criteri
sono in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
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
