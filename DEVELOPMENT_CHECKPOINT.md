# Glow — punto di ripresa dello sviluppo

Aggiornato il 16 ottobre 2026: **W14 foto e autorizzazioni implementati e verificati nel browser**.
Checkpoint di questo incremento: `checkpoint-photos-2026-10-16` sul ramo `main`.
Precedenti: `checkpoint-signature-2026-10-16` (commit `0f41cdc`),
`checkpoint-intake-2026-10-15` (commit `1a98da4`),
`checkpoint-clinical-2026-10-15` e `checkpoint-2026-10-15`.
Non è ancora il pilota R1.

## Scelte confermate

Glow, Next.js/React/TypeScript, shadcn/ui originale, FullCalendar 7.1.2 Monarch,
Supabase ufficiale `mexokvvvxdyekauupwvt`. PWA installabile con connessione
necessaria; nessuna agenda/dossier offline, coda di scritture, IndexedDB clinico
o service worker che conservi dati riservati. WhatsApp manuale con chat/testo
pronti, senza consegna dichiarata. Skill di stile in `.agents/skills`.

Resend confermato e dominio acquistato: DNS, caselle e integrazione rinviati per
scelta utente. Non chiedere ora credenziali o dominio e non attivare invii reali.
Auth SMTP è una configurazione separata, ancora da verificare sul dominio reale.

## Funzioni disponibili

Auth SSR/onboarding, conferma/reset; clienti con ricerca/storico/archivio;
servizi e sedi; calendario in quattro viste, conflitti/versioni/idempotenza,
stati e WhatsApp manuale; riepilogo del valore delle sedute completate.
Team con inviti, sospensione, abilitazione clinica e assegnazione clienti.
Revoche e operazioni cliniche condividono il lock tenant e ricontrollano i permessi.

W10: Storage immagine privato con staging, hash/MIME/dimensione/20MP,
normalizzazione senza EXIF/GPS, finalizzazione immutabile, URL di lettura auditati
30 secondi e pulizia con lease/riconciliazione. Vietati token di upload firmato,
listing/download/upsert ordinari. Galleria per categoria collegata in W14.

W11: modelli consenso/anamnesi con pubblicazioni immutabili, catalogo pigmenti,
lotti/scadenze ed etichette private; preparazione appuntamento ancora in bozza.
Risposte nello schema privato, lette solo tramite RPC auditata; memoria del form,
mai cache persistente. Testi e informazioni dei lotti già scelti restano stabili.

W12: link di compilazione 24h e tablet 30min, entro fine appuntamento. Token casuali
hash-only, frammento rimosso dalla barra. GET/HEAD non consumano; POST atomico
salva risposte, audit, ricevuta e consumo. Non raccoglie una firma. DTO minimo,
limiti persistenti, revisioni/scadenza/revoca. Tablet effettua logout server e
navigazione completa; esito di avvio ambiguo porta all’accesso. Non è un kiosk OS.
Contratto [INTAKE.md](INTAKE.md).

## W13 consegnato

Da preparazione salvata → **Firma e documenti**: link dedicato o tablet,
controllo di testi/risposte/lotti ed etichette, nome, firma disegnata e conferma
esplicita. Firma con pointer o tastiera; nessuna pressione/velocità biometrica
registrata né dichiarazione di firma digitale qualificata.

Snapshot privato fissato all’emissione; hash riconosciuto all’invio. Firma,
payload immutabile, ora server, consumo, audit e job PDF nello stesso commit.
Un documento per revisione, documenti successivi collegati senza riscrittura.
Cambio preparazione/appuntamento, revoca/scadenza, lotti non disponibili e
revoca clinica impediscono una nuova firma. Esito perso → tentativo esatto
bloccato in memoria e retry con la stessa ricevuta, senza doppia firma.

PDF privato con pdf-lib/fontkit/Noto Sans versionati, testi/risposte/firma e
copie delle etichette verificate. Font incluso nei bundle server; controllo
caratteri prima della firma, accenti/testo lungo e paginazione verificati.
Blocco conferma/nome/data/firma tenuto insieme. Coda privata con lease/fencing,
byte deterministici, upload senza overwrite e rilettura SHA-256 prima di ready.
Crash dopo upload → riuso dell’oggetto, nessuna rifirma.

`after()` avvia il lavoro in background su Vercel (max 60s). Se non parte o
fallisce, **Riprova generazione PDF** lo riprende con autorizzazione corrente.
Scheduler continuo di retry ancora W15/pilota. Download POST auditato, checksum
e no-store; bucket PDF senza grant Storage alle sessioni ordinarie.
Contratti e limiti: [DOCUMENTS.md](DOCUMENTS.md).

## W14 consegnato

Galleria riservata per seduta Prima/Dopo/Guarito, selezione file/fotocamera,
orientamento e compressione JPEG a 2400 px. Anteprima prima del salvataggio,
HEIC con recupero utilizzabile; doppio controllo server e retry dello stesso
tentativo senza ri-upload dopo risposta finale persa. Controlli concorrenti
bloccati durante il caricamento. Confronto accessibile con pulsanti e due foto
della stessa seduta; archivio esplicito, distinto da cancellazione.

Scelte documentazione/uso dimostrativo facoltative e non preselezionate nel
flusso di firma, registrate e revocabili separatamente dal consenso medico.
Testo e sì/no nel payload immutabile e PDF v2; renderer v1 conservato per lo
storico. Revoca durante upload impedisce l’inserimento; foto già raccolte restano
private. Nessuna pubblicazione automatica. Letture binarie auditate no-store,
SHA/dimensione verificati e permessi ricontrollati; blob in memoria, 60s e
revoca alla tab nascosta/smontaggio. Nessuna URL Storage nella galleria.

Contratto [PHOTOS.md](PHOTOS.md), inclusi limiti: raccolta di nuove scelte entro
la validità della firma del trattamento, ultime 200 sedute nel selettore,
retention e allegati pronti senza galleria in W19. Collaudo fisico e testi reali
restano prima del pilota.

## Database e deploy

Quindici migrazioni `202610150001`–`202610160015` applicate e ri-verificate
con checksum sul progetto ufficiale; riapplicazione idempotente. Ventidue tabelle
pubbliche con RLS; quattro nuove tabelle documentali private con RLS e senza
grant anon/authenticated. Bucket `glow-private` e `glow-documents` privati.
Nessuna fixture remota creata: nuove tabelle foto/autorizzazioni vuote al controllo W14. Non azzerare o seminare il database ufficiale.

Vercel: nuovo progetto `glow`, repository GitHub `cesco9846/Nextapp`, branch
`main`, Node24/dub1, deploy automatico. URL https://glow-phi-eosin.vercel.app.
Variabili production e callback Auth canonici configurati; preview disabilitate.
Prima di dichiarare un nuovo deploy pronto verificare SHA e READY su Vercel e
GitHub Actions. Configurazione e procedura in [DEPLOYMENT.md](DEPLOYMENT.md).

## Evidenze

- Lint e TypeScript, build di produzione, 16 test unitari.
- 322 asserzioni pgTAP su sette file, con 31 nuove sulle foto. Nessun grant
  implicito o DML diretto, categorie/idempotenza, file verificato, scope/ruoli,
  revoca durante upload e lettura, archivio e audit.
- 43 scenari Chromium completi su database locale ripristinato da zero; quattro
  nuovi sulle foto, ripassati sulla build finale. Compressione/orientamento EXIF,
  firma con scelte distinte, esito perso senza duplicati, confronto, HEIC,
  offline senza coda e revoca dell’assegnazione mentre una lettura attende il lock.
- PDF v1/v2 deterministici e testo estratto da Poppler, incluso sì/no delle foto;
  lo storico conserva il renderer precedente. Coda e recupero W13 restano provati.
- Quindici migrazioni ricreate localmente e riapplicate con checksum al remoto;
  22 tabelle pubbliche RLS e due bucket privati, nessuna fixture remota.
- Quindici catture foto/scelte valide a 375/820/1280; pulsanti rilevanti da 44px,
  nessun overflow orizzontale. Detector una volta: zero rilievi. Tre raster
  pubblici preesistenti, provenienza completa; nessun nuovo raster distribuito.

Revisione grafica W14: `ship` sull’implementazione e sulle quindici catture
fornite, nessun fix materiale. Documenter senza modifiche al sistema: palette,
tipografia e regole Glow conservate. Varianti compatte preesistenti non promosse
a default touch; collaudo fisico e testi privacy ancora da verificare.

## Avvio e ripresa

Usare il checkout esistente, senza worktree salvo richiesta. Node24, Python3,
Docker locale e `poppler-utils` per i test PDF. Cache npm/Impeccable/Playwright
sotto `/workspace/.cache`. Non stampare segreti; usare i binding già funzionanti.
`node --use-env-proxy --import tsx ...` mantiene il proxy per gli script TSX.

`npm run db:start`, `npm run db:migrate:local`; per una suite SQL pulita
`npm run db:reset` distrugge soltanto fixture locali. Eseguire SQL prima degli
E2E, che generano altre fixture. `npm run test:e2e` usa `.next-e2e`/porta3100;
la build normale `.next` usa configurazione ufficiale. I processi non sopravvivono
al ripristino: ricompilare/avviare il server quando necessario. Le catture sono
riproducibili con `scripts/capture-photos-ui.ts` e
`scripts/capture-signature-ui.ts` solo su DB locale. Reset necessario prima
di ripetere la suite completa: il test di pulizia usa batch limitati e presuppone
fixture pulite, come la CI.

## Prossime attività

1. **W15**: worker outbox, lease/fencing, retry, esiti incerti e monitoraggio.
   Sviluppare contro adattatore di prova; nessun invio reale ora.
2. W16–W17: Resend reale, mittente/Reply-To, webhook e conferma/disdetta.
   Configurazione dominio quando l’utente riprende il punto.
3. Export/retention/privacy, pulizia schedulata e alert, backup DB+Storage/restore,
   performance, dispositivi fisici, installazione PWA e gate R1.
4. ICS, billing/fatture e funzioni commerciali del piano nelle rispettive fasi.

Non confondere build/test locali, database migrato, push GitHub e deploy Vercel.
Non dichiarare completati consegna SMTP, dispositivi fisici, restore o pilota clinico.
