# Piano di verifica e rilascio

Stato al 15 ottobre 2026: lint, tipi, build, 10 test unitari, 176 asserzioni pgTAP
su quattro file e 24 scenari Chromium su build di produzione e Supabase locale reale
superati. Sono coperti Auth con email catturate localmente, agenda, isolamento,
team/revoca, rete/PWA e file privati. Per i file: MIME/hash/limiti, accessi negati,
normalizzazione, completamento concorrente, riuso di oggetto già scritto,
pulizia dopo crash, lease e idempotenza. Il test dei token di upload firmato
falliva prima della guardia operativa 006 e passa dopo la correzione.

Provati reset locale da zero, undici migrazioni, ripetizione e checksum. Tutte e undici
applicate al remoto: diciassette tabelle pubbliche RLS, bucket privato, zero dati/oggetti di
prova. Comando di pulizia remoto verificato senza fixture (zero claim). Server
ricompilato con configurazione ufficiale e risposte health/login/manifest/API
senza sessione verificate. Revisione team `ship`. Revisione clinica: otto catture, correzione delle schede
mobili e conferma `ship` sul difetto valutato; documenter senza modifiche al sistema.

Il workflow GitHub è definito; esito del nuovo commit da verificare dopo push.
Sono inoltre coperti pubblicazione/versioni concorrenti, domande/risposte,
immutabilità dei testi e snapshot dei lotti, scadenza rispetto all’appuntamento,
scope etichetta, assegnazioni/revoca, audit obbligatorio e fallimento dell’audit.
Due richieste HTTP cliniche vengono bloccate sul lock reale del tenant: la revoca
commessa prima dello sblocco impedisce sia lettura sia scrittura, senza audit
di lettura riuscita né modifica della bozza. Il test UI verifica le due righe
di schede a 375 px e i touch target da almeno 44 px, oltre al flusso completo.
I form mantengono l’input solo in memoria e non inviano al ritorno della rete.

Link cliente, firme/PDF, foto per categoria, email reali, dispositivi fisici, installazione PWA HTTPS,
scheduler file, backup/restore e gate R1 restano da completare. Questi risultati
non equivalgono al collaudo completo del prodotto.

## Livelli di verifica

| Livello         | Strumento previsto                                             | Scopo e ambiente                                                                                                        |
| --------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Statico/build   | TypeScript strict, ESLint, build Next.js                       | Contratti, import server/client e artefatto distribuibile. Installazione da lockfile e versioni Node/pacchetti fissate. |
| Dominio         | Vitest                                                         | Stati, date/fusi, validazione, messaggi e regole: input e output osservabili, non copie dell'implementazione.           |
| Database        | Supabase locale + pgTAP                                        | RLS, FK tenant, vincoli, transazioni, ruoli e migrazioni ricreate da zero.                                              |
| Integrazione    | Client HTTP e DB sullo stack test                              | Sessione reale, RPC, concorrenza, Storage, token e failure injection.                                                   |
| Browser         | Playwright su Chromium/WebKit, Firefox per percorsi principali | Login, agenda, firma, upload, isolamento cache, responsive, tastiera e interruzioni di rete.                            |
| Servizi esterni | Sandbox/inbox e staging                                        | Email/SMTP, cron, webhook, URL firmati, Stripe/fatture; fakes non equivalgono a verifica esterna.                       |
| Dispositivi     | iPhone, Android, tablet e PC                                   | Installazione PWA, fotocamera, firma col dito, tastiera software, pinch/scroll e sospensione/ripresa.                   |

Scripts da rendere disponibili in W01/W03: `lint`, `typecheck`, `test:unit`,
`test:integration`, `test:db`, `test:e2e`, `build`, `db:types` e verifica tipi
generati. Sono nomi di contratti futuri, non comandi già esistenti nel repository.

## Scenari che devono poter fallire

| Area             | Prove necessarie                                                                                                                                  | Evidenza richiesta                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identità/ruoli   | Sessione assente/scaduta/manomessa, utente disattivato, ruolo alterato nel payload, invito scaduto, ultimo owner, bootstrap ripetuto.             | HTTP corretti e stato DB invariato per richieste respinte.                                                                                                                    |
| Tenant           | Due tenant A/B, owner e operatrici con/senza abilitazione; ogni CRUD e FK, RPC, Storage e URL firmata.                                            | Matrice tabella/operazione/ruolo completa. Eseguire come utenti autenticati reali o ruolo SQL corrispondente; mai solo come postgres/service_role.                            |
| Anamnesi         | Richiesta consentita e negata, SELECT diretta, revoca assegnazione, audit non scrivibile.                                                         | Nessun accesso clinico senza permesso e audit; nessun dato sanitario nei log o nel JSON di agenda/clienti ordinari.                                                           |
| Appuntamenti     | Creazioni concorrenti sovrapposte, intervalli adiacenti, sedi diverse stessa operatrice, modifiche con versione vecchia, rete interrotta e retry. | Una sola creazione per chiave; 409 per conflitto; outbox e appuntamento coerenti dopo rollback.                                                                               |
| Date             | Europe/Rome 29 marzo e 25 ottobre 2026, ora inesistente/ambigua, browser con altro fuso, cambio giorno/mese/anno.                                 | Timestamp e reminder attesi espliciti; input ambiguo richiede offset/scelta, non normalizzazione silenziosa.                                                                  |
| Link             | Scadenza limite, hash sconosciuto, revoca, riuso e doppio POST concorrente; GET da scanner; scopo o revisione errati.                             | Una sola mutazione autorizzata; GET senza effetti; nessun token o dettaglio studio divulgato.                                                                                 |
| Documenti        | Cambio modello dopo firma; modifica lotti; crash renderer; upload riuscito ma finalizzazione fallita; retry PDF.                                  | Snapshot/checksum invariati, un documento logico, PDF recuperabile senza rifirma, stato pending/failed corretto.                                                              |
| Foto/file        | MIME e magic bytes discordanti, file grande, SVG attivo, file troncato, orientamento/HEIC, cambio tenant, upload abbandonato.                     | Rifiuto sicuro o conversione prevista; nessun file pronto senza validazione; pulizia orfani non elimina file referenziati.                                                    |
| Messaggi         | Due worker, lease scaduto, crash prima/dopo accettazione provider, 429/5xx, bounce definitivo, evento duplicato/fuori ordine.                     | Unicità di coda e claim; idempotenza esterna verificata o stato incerto riconciliabile; nessuna promessa di exactly-once non dimostrata.                                      |
| Scheduling       | Sposta/annulla prima del claim, durante il claim e dopo accettazione; crea appuntamento entro 24h; modifica destinatario.                         | Solo revisione corrente inviata ove ancora annullabile; limite dell'invio già accettato esplicito e visibile; niente reminder scaduti generati retroattivamente.              |
| WhatsApp         | Telefono nazionale senza prefisso, internazionale valido, testo con accenti/&/newline, nessun numero, desktop senza app nativa.                   | URL corretto e fallback comprensibile; nessun invio/consegna fittizi in UI.                                                                                                   |
| PWA/rete         | Rete spenta durante un modulo, riconnessione, risposta persa dopo POST, cambio account e revoca, prompt installazione presente/assente.           | Avviso chiaro, input conservati, nessun invio accodato o falso successo. Idempotenza preservata, letture aggiornate dopo riconnessione, nessuna persistenza offline dei dati. |
| UI/accessibilità | Viewport 375/820/1280, tastiera, screen reader, errori form, rete lenta, liste vuote, touch e stato insoluto.                                     | Flussi eseguibili senza drag; focus preservato; nessun overflow principale; controlli tattili ≥44px.                                                                          |
| Billing/fatture  | Trial/attivo/insoluto/cessato, grace period, webhook falsi/duplicati/fuori ordine, errore SdI.                                                    | Entitlement server coerente, export disponibile, dati preservati; esiti fiscali distinti dal pagamento.                                                                       |
| ICS/push         | Revoca token, cambio evento, dati minimizzati, push negata/scaduta, iOS installata/non installata.                                                | Feed valido e accesso revocato; fallback reale; nessuna informazione clinica nei payload.                                                                                     |

## Fixture e failure injection

Factory sintetiche per A/B, owner/operatori, clienti omonimi e contatti condivisi,
appuntamenti in tutti gli stati, lotti validi/scaduti, consensi di due versioni.
Usare orologio controllato per test deterministici, senza dipendere dall'ora reale.
La concorrenza richiede connessioni/processi distinti al DB, non due chiamate mock.

Simulare failure del provider, rete, renderer e Storage in punti precisi. Separare
test con adapter finto da prove reali, conservando risultati e timestamp del run.
Impedire al test runner di puntare alla ref produzione `mexokvvvxdyekauupwvt`;
seed e reset accettano solo target esplicitamente classificati test.

## Pipeline continua

Ogni PR: installazione frozen, lint, typecheck, unità pertinenti, DB/RLS/API,
build ed E2E critici. Le modifiche solo documentali verificano link, coerenza e
diff, senza avviare inutilmente tutta la suite. Migrazioni o auth richiedono
sempre l'intera matrice d'isolamento; reminder richiedono concorrenza e fusi;
service worker richiede l'intera prova cache/aggiornamento/logout.

I test con servizi reali girano in staging con credenziali dedicate e destinatari
di prova. Il rilascio non può saltarli dichiarando equivalenti i mock. Prima di
ogni traguardo: ripetere i flussi completi cambiati; non espandere suite estranee
quando il rischio e la copertura sono già chiariti.

Registrare comando, versione/commit, target, data, conteggi passed/failed/skipped,
report del run e verifiche manuali. Nessuna suite zero-test o report di un run
precedente vale come evidenza. Se un requisito è differito, aggiornare anche il
rilascio dichiarato; non nasconderlo dietro una spunta verde.

## Budget iniziali e operatività

Obiettivi da misurare su staging, non garanzie già raggiunte:

- Dataset minimo per performance: 1.000 clienti e 5.000 appuntamenti sintetici;
  10 sessioni simultanee, API lettura p95 ≤500 ms e conferma di una scrittura p95 ≤1 s,
  escludendo provider esterni dal percorso sincrono. Conservare hardware/regione e misure.
- Query agenda per massimo 42 giorni, pagine clienti default 50/max 100; thumbnail
  per liste foto, nessun download degli originali per visualizzare l'agenda.
- Cron reminder ogni minuto; allarme se heartbeat oltre 5 minuti o lavori dovuti
  oltre 5 minuti. Lease più lungo del timeout worker; limite iniziale 5 tentativi
  con attesa crescente e jitter, rispettando Retry-After; esito incerto non reinviato alla cieca.
- Backup DB e oggetti privati: obiettivi iniziali RPO ≤24h e RTO ≤4h, da confermare
  con piano Supabase, costi, strategia Storage e prova cronometrata. Se non raggiunti,
  registrare lo scarto e decidere il requisito prima del rilascio con dati reali.
- Runbook: worker fermo, invio incerto, PDF fallito, revoca accesso, restore DB/file,
  rollback app, compromissione credenziale e richiesta privacy. Segreti mascherati
  e log limitati a correlation ID, codici e tempi; niente corpi clinici.

## Gate R1 — pilota operativo

- [ ] W01–W20 verificati, incluse prove reali dei provider necessari.
- [ ] Nessun difetto noto di isolamento, autorizzazione, perdita dati o firma.
- [ ] Template/informative/retention approvati per l'uso previsto e credenziali
      separate tra test e produzione; nessun testo demo presentato come definitivo.
- [ ] Test responsive e dispositivi reali documentati, inclusi fotocamera, installazione e perdita di rete.
- [ ] Migrazioni ricreabili; restore di DB **e file** riuscito e cronometrato.
- [ ] Health, monitor esterno, allarmi e referente operativo disponibili.
- [ ] Configurazione invii reali limitata e verificata; nessun seed di prova in produzione.

## Gate R2 — Fase 1 completa/commerciale

- [ ] Gate R1 mantenuto dopo gli incrementi successivi.
- [ ] W21–W25 verificati, incluse integrazioni fiscali e pagamento in ambiente di prova.
- [ ] Prezzi, grazia e condizioni deliberati; webhook e entitlement verificati server-side.
- [ ] Documento di rilascio identifica commit, migrazioni, feature flag e target.
- [ ] Smoke post-rilascio riuscito; rollback app compatibile con lo schema corrente.
- [ ] Testi commerciali controllati con la skill copywriting e rispecchiano le funzioni disponibili.

Queste checklist sono tutte aperte. La disponibilità delle credenziali e la
presenza dei documenti di progetto non costituiscono un rilascio verificato.
