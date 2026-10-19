# Glow — punto di ripresa dello sviluppo

Aggiornato il 19 ottobre 2026: **W16.b — preferenze email e storico dei promemoria**.
Checkpoint di questo incremento: `checkpoint-reminder-ui-2026-10-19` sul ramo `main`.
Precedente correzione account: `checkpoint-signup-fix-2026-10-16` (`dc947b1`).
Precedente W16.a: `checkpoint-resend-2026-10-16` (`f86c51c`).
Precedente W15: `checkpoint-reminders-2026-10-16` (`5790217`).
Precedenti: `checkpoint-photos-2026-10-16` (commit `05bdf0a`),
`checkpoint-signature-2026-10-16` (commit `0f41cdc`),
`checkpoint-intake-2026-10-15` (commit `1a98da4`),
`checkpoint-clinical-2026-10-15` e `checkpoint-2026-10-15`.
Non è ancora il pilota R1.

## Scelte confermate

Glow, Next.js/React/TypeScript, shadcn/ui originale, FullCalendar 7.1.2 Monarch,
Supabase ufficiale `mexokvvvxdyekauupwvt`. PWA installabile con connessione
necessaria; nessuna agenda/dossier offline, coda di scritture, IndexedDB clinico
o service worker che conservi dati riservati. WhatsApp manuale con chat/testo
pronti, senza consegna dichiarata. Skill di stile in `.agents/skills`.

Configurazione Resend ripresa dall’utente: dominio **glowlabs.it**, chiave sicura
`RESEND_API_KEY` ready con permessi sending-only e invio al simulatore accettato.
Mittente scelto **Glow <reminder@glowlabs.it>**. Secret webhook configurato anche su Vercel e inbox confermata; non richiedere
duplicati delle chiavi già funzionanti. Dominio app canonico https://glowlabs.it;
vecchio URL Vercel reindirizza308. Callback Auth e webhook sul nuovo dominio verificati.
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
Il runner continuo dei PDF resta da collegare prima del pilota;
il worker W15 consegnato qui riguarda i reminder. Download POST auditato, checksum
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

## W15 consegnato

Motore batch separato dal server web, con provider di prova locale. Lease 60s,
fencing, chiave/snapshot stabili e controllo finale serializzato con calendario
e recapiti. Una modifica commessa prima del confine impedisce l’invio; dopo
il confine l’email potrebbe essere in volo e non viene dichiarata richiamata.
Timeout/ack perso/lease scaduta in volo impongono lookup, mai retry cieco.
Massimo cinque dispatch certi e sei lookup, backoff/jitter e finestra di recupero
di due ore; accettato distinto da consegnato.

Quattro tabelle private/RLS per configurazione, run, dispatch e allarmi. Monitor
con heartbeat, ritardo coda, incerti, fallimenti e run fallito; CLI exit2 se
degradato e allarmi persistibili. GET health riservato alla titolare, conteggi
solo del proprio studio, no-store. Nessun dato destinatario/testo nei report.

`REMINDER_WORKER.md` documenta comandi, contratti provider e runbook. Master
switch ufficiale disabled; adapter reale aggiunto in W16.a, nessun cron o notifica esterna
attivato. I comandi ufficiali sono stati eseguiti: disabled, zero claim/invii,
salute ok. W16.a aggiunge adapter/identità/webhook backend; webhook live verificato,
runner Edge/cron continuo ancora da collaudare prima dell’attivazione.

## W16.a — backend Resend

Adapter reale a origine fissa, senza retry impliciti, conservativo su 409/5xx/rete.
Envelope v2 fissa anche From e Reply-To Auth confermato della titolare. Impostazioni
via API owner-only/same-origin, senza retroattività e senza controllo del master switch.
Webhook raw Svix, stream 64KiB, proiezione minima, deduplica/correlazione e gestione
monotona degli eventi, anche prima dell’ack. Bounce permanente/complaint/suppressed
bloccano nuovi invii allo stesso indirizzo per tenant e compaiono nella salute.
Nessun lookup mediante un nuovo POST: soltanto evidenza firmata; assenza resta unknown.

Prova del nuovo adapter sul simulatore Resend accettata dal mittente scelto.
Una prova alla casella autorizzata dall’utente è stata accettata dal provider;
l’utente ha confermato la ricezione nella posta in arrivo. Webhook remoto configurato e prove tecniche completate sul dominio canonico.
Aperto W16: runner/monitor operativo e SMTP Auth separato; UI consegnata in W16.b.
Runner Edge/cron, hard timeout e notifiche monitor prima dell’abilitazione.
Dettagli, configurazione e comandi in [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md).

## W16.b — preferenze e storico email

Da **Il tuo studio → Gestisci promemoria email**, solo la titolare può salvare
la preferenza e consultare lo storico. Il servizio globale ancora OFF è distinto
dalla scelta dello studio. Mittente scelto e Reply-To confermato sono in sola
lettura. Regola delle 24 ore e assenza di recupero retroattivo esplicite.

API di lettura con sessione/RLS, DTO minimo senza indirizzi cliente, testo o ID
provider. Pagine di 25, cursore validato su scadenza/ID; filtro include fallimenti,
incertezze ed elaborazione. Le date usano il fuso dello studio e la scadenza del
messaggio storico. Scheda cliente esistente apribile dallo storico.
Accettazione distinta dalla consegna al server destinatario e dalla lettura;
richiesta di annullamento in volo visibile, nessun pulsante di reinvio o sblocco.
Salvataggio esplicito, errore recuperabile senza perdere la preferenza compilata,
controlli offline disabilitati e nessuna scrittura differita.

Verifica locale: lint, typecheck e build; sette E2E mirati passati (quattro nuovi
UI/API e tre integrazione Resend). Permessi operatrice/altro studio, proiezione
privata, cursori malformati, pagina con date uguali, salvataggio, offline e
scheda cliente verificati. Impeccable `ship` sulle sette catture a 375/820/1280px;
unico advisory del detector: 11px della navigazione mobile preesistente.
Sistema di stile conservato, nessun asset pubblico aggiunto.

Nessuna migrazione necessaria: ventuno migrazioni immutate. Nessuna fixture
ufficiale o nuova email di prova. Invii automatici ancora disattivati.

## Database e deploy

Ventuno migrazioni `202610150001`–`202610160021` applicate e ri-verificate
con checksum sul progetto ufficiale; riapplicazione idempotente. Ventidue tabelle
pubbliche con RLS; tabelle documentali e sei tabelle outbox/Resend private con RLS e senza
grant anon/authenticated. Bucket `glow-private` e `glow-documents` privati.
Nessuna fixture remota creata: nuove tabelle operative senza fixture al controllo W15. Non azzerare o seminare il database ufficiale.

Vercel: nuovo progetto `glow`, repository GitHub `cesco9846/Nextapp`, branch
`main`, Node24/dub1, deploy automatico. URL https://glowlabs.it; vecchio URL Vercel redirect308.
Variabili production e callback Auth canonici configurati; preview disabilitate.
Prima di dichiarare un nuovo deploy pronto verificare SHA e READY su Vercel e
GitHub Actions. Configurazione e procedura in [DEPLOYMENT.md](DEPLOYMENT.md).

## Evidenze

- Lint, TypeScript, build di produzione e **42 unit** passati (18 nuovi Resend).
- **414 pgTAP su nove file**, 33 nuovi su identità, eventi anticipati/fuori ordine,
  deduplica, ack, correlazione, soppressione e permessi.
- **52 scenari Playwright** completi su reset locale pulito; tre nuovi su API
  impostazioni, webhook prima dell’ack e firme/stream/correlazione/bounce.
  I sei W15 continuano a provare concorrenza, cancellazione in attesa/in volo,
  crash reale, ack perso e CLI.
- Due worker concorrenti: una sola submission. Timeout dopo accettazione,
  SIGKILL reale del processo e ack SQL perso: lookup senza seconda submission.
- Due fixture PDF multipagina hanno ora timeout20s per font/Poppler su runner
  condivisi; contenuto e determinismo continuano a essere verificati, nessuna
  asserzione rimossa. I default5s erano insufficienti sotto contesa CPU.
- Ventuno migrazioni ricreate localmente e ri-verificate al remoto con
  checksum/idempotenza; 22 tabelle pubbliche RLS e due bucket privati.
- Incremento backend: nessuna modifica ai componenti visivi o al sistema Glow.

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

1. **W16**: collegare runner continuo autenticato con hard timeout e monitor
   esterno, quindi collaudo operativo prima dell’abilitazione. Preferenze/esiti
   W16.b disponibili. Webhook/secret/dominio e inbox verificati. Non chiedere
   duplicati di RESEND_API_KEY. Auth SMTP separato. Contratto in EMAIL_DELIVERY.md.
2. W17: conferma/disdetta sicura. Collegare runner continuo e monitor operativo
   con notifica esterna, insieme al retry PDF e scheduler pulizia, prima del pilota.
3. Export/retention/privacy, pulizia schedulata e alert, backup DB+Storage/restore,
   performance, dispositivi fisici, installazione PWA e gate R1.
4. ICS, billing/fatture e funzioni commerciali del piano nelle rispettive fasi.

Non confondere build/test locali, database migrato, push GitHub e deploy Vercel.
Non dichiarare completati consegna SMTP, dispositivi fisici, restore o pilota clinico.

## Correzione registrazione — 16 ottobre 2026

Il rifiuto effettivo nei log Auth era POST/signup422 con
“Password should be at least 10 characters.” Nessun errore SMTP nella richiesta
in esame. Il messaggio generico nascondeva il requisito già imposto da Supabase.
Validazione esplicita prima dell’SDK per registrazione e recupero: minimo 10 punti
di codice, anche quando autofill o UTF-16 aggirano minlength HTML. Errori weak_password
distinguono lunghezza da altra debolezza senza esporre diagnostica provider.
Campo invalidato/descritto, focus e dati conservati; login non impone la policy
di creazione a password di account preesistenti. Nessuna policy server abbassata.

Sei scenari mirati Playwright passati: ciclo locale email/conferma/recupero con
nuovo controllo, callback invalido, autofill breve, Unicode, errori server e login.
Sei catture sintetiche 375/820/1280 dei due errori, detector una volta, zero rilievi.
42 test unitari, lint, build e TypeScript passati. Revisione Impeccable ship
sulle sei catture, nessun fix materiale; sistema Glow preservato. Verifica
finale della pubblicazione controllata sullo stesso commit del checkpoint.
Nessun account/email di prova nel progetto ufficiale, nessuna modifica SMTP.
