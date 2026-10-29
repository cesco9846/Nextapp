# Glow — punto di ripresa dello sviluppo

Aggiornato il 29 ottobre 2026: **stabilizzazione link, sessioni, database e interfaccia**.
Checkpoint: `checkpoint-stabilization-2026-10-29` sul ramo `main`.
Precedente consensi: `checkpoint-consent-packages-2026-10-28` (`53d0f76`).
Precedente gestione protetta: `checkpoint-safe-management-2026-10-21` (`7e650ab`, documentazione `cb65c03`).
Precedente W19: `checkpoint-privacy-2026-10-21` (`a357a3e`); Impeccable 4.7.0 (`f4ba2cb`).
Precedente W18: `checkpoint-pwa-2026-10-21` (`9aa3543`), esiti iPhone `4a40f5b`.
Precedente operativo W17: `checkpoint-operations-2026-10-20` (`bba1859`).
Precedente W17 link: `checkpoint-appointment-responses-2026-10-20` (`22e6ccf`).
Precedente retention: `checkpoint-log-retention-2026-10-19` (`2459bf9`).
Precedente attivazione: `checkpoint-reminders-live-2026-10-19` (`a93c085`).
Precedente lotti/scheduler: `checkpoint-lots-scheduler-2026-10-19` (`1fcd5f8`).
Precedente W16.b: `checkpoint-reminder-ui-final-2026-10-19` (`41218df`).
Precedente correzione account: `checkpoint-signup-fix-2026-10-16` (`dc947b1`).
Precedente W16.a: `checkpoint-resend-2026-10-16` (`f86c51c`).
Precedente W15: `checkpoint-reminders-2026-10-16` (`5790217`).
Precedenti: `checkpoint-photos-2026-10-16` (commit `05bdf0a`),
`checkpoint-signature-2026-10-16` (commit `0f41cdc`),
`checkpoint-intake-2026-10-15` (commit `1a98da4`),
`checkpoint-clinical-2026-10-15` e `checkpoint-2026-10-15`.
Non è ancora il pilota R1.

## Stabilizzazione — stato corrente del 29 ottobre 2026

Contratto, limiti, misure ed esiti in
[STABILIZATION_IMPLEMENTATION.md](STABILIZATION_IMPLEMENTATION.md).
Piano completo: [STABILIZATION_PLAN.md](STABILIZATION_PLAN.md).
Implementati S01, miglioramenti S00/S04/S05 e porzione lock/indici di S06;
gate S03 per pubblicare solo lo SHA main con CI riuscita. Migrazioni additive
030–032, nessuna modifica ai file SQL già ufficiali 001–029.

Il gateway pubblico isola origine, token e tenant senza il precedente contatore
globale. Identità IP derivata dal proxy fidato, HMAC giornaliero e pulizia oraria
a lotti; nessun nuovo cron. Sessioni API controllate tramite JWT verificato e
RPC con sessione Auth corrente; non si mantiene cache globale dei permessi.
Ricerca clienti con debounce, stato di aggiornamento e elenco precedente sicuro;
membership ogni 15 secondi senza ricaricare i cataloghi. PWA online invariata.
Impeccable aggiornato a **4.8.0**, come richiesto nel turno precedente.

S02 backup/restore resta bloccante prima dei dati reali: destinazione off-site,
chiavi separate e accesso PostgreSQL da predisporre; non è stato prodotto un
backup completo remoto. Per l’automazione S03 serve VERCEL_TOKEN nei Secrets
Actions della repository; l’integrazione disponibile non può scriverli (403).
Finché manca, eseguire il medesimo script dal workspace dopo CI verde.
Staging isolato, S07/S08 e gate privacy non sono chiusi da questo rilascio.

Produzione prevista su **Hostinger VPS cloud privato** per **3–5 utenti**;
app/API/SSR/PDF sul VPS, Supabase DB/Auth/Storage e glowlabs.it mantenuti.
Contratto, regione, budget, backup esterno e cutover da validare. Nessun VPS
acquistato o modificato. Fino ai prerequisiti si usano soltanto dati sintetici.
Non dichiarare R1, GDPR o disponibilità backup conclusi.

Le sezioni sotto sono cronologia: i relativi conteggi e indicazioni «prossimo
turno» non prevalgono sullo stato corrente o sul contratto di stabilizzazione.

## Adeguamento privacy — prossimo lavoro prima dei dati reali

Richiesta del 28 ottobre 2026: valutare GDPR e altre norme italiane.
Gap analysis e incrementi CP-00–08 in [COMPLIANCE_PLAN.md](COMPLIANCE_PLAN.md),
collegati al piano e al gate R1. L’utente conferma solo dati sintetici e percorso
prima studio della sorella, poi SaaS. Regione e soggetto gestore da confermare.

Priorità CP-00: piano Vercel Hobby osservato, funzioni dub1/Irlanda e Supabase
eu-west-1. Hobby non è il piano per l’uso commerciale; il DPA pubblico Vercel
Pro/Enterprise esclude categorie particolari in Schedule 1 §6, salvo diversa
pattuizione da verificare. Non basta passare a Pro o scegliere una regione UE.
Decidere accordi e hosting idonei prima di anamnesi/foto/documenti reali.

Informative del gestore, contratti, percorsi sanitari personalizzati/legacy,
diritti/cancellazione, DPIA e backup/restore richiedono completamento e verifica.
Già presenti controlli di isolamento, documenti privati, export e nuovi consensi;
non costituiscono attestazione legale. Nessuna modifica operativa o pubblicazione
di testi legali durante questa analisi; lo stato di sviluppo dei consensi segue sotto.

## Moduli predefiniti — stato corrente

Piano approvato: [DEFAULT_CONSENT_PLAN.md](DEFAULT_CONSENT_PLAN.md).
Contratto e uso: [DEFAULT_CONSENTS.md](DEFAULT_CONSENTS.md).
«Consensi e pigmenti» → «Usa un modello predefinito»: profilo documentale,
copia Microblading/Lip Blush associata per ID servizio, bozza persistente,
revisione e pubblicazione owner-only. Testi generici senza i contatti della
professionista sorgente; informativa e requisiti territoriali dello studio da
completare. Confronto per future revisioni della base, adozione esplicita in
bozza e nuova revisione; nessun aggiornamento automatico di testi personalizzati.

Dalla preparazione si selezionano nascita/tipo seduta/lotti e verifiche delle
identità. Minori inclusi su richiesta esplicita: uno o due rappresentanti,
ruolo, contatto e poteri verificati; requisiti configurati e confermati dalla
titolare, nessuna età minima regionale inventata. Un imminente passaggio alla
maggiore età rinvia il documento al compleanno. Il link non prova identità.

Pagina capability `/documento#token`, hash-only, no-store/no-referrer, senza
cookie professionali o persistenza locale. Ricevuta sanitaria prima delle
risposte, rifiuto senza anamnesi o annullamento appuntamento, questionario
13/14 Sì/No e spiegazioni. Con due rappresentanti, tutti prestano prima il
consenso sanitario e il primo compila; tutti firmano lo stesso snapshot.
Dichiarazioni distinte per trattamento/ricezione/ruolo, foto facoltative e
ambito dettaglio/riconoscibile. Prevale la scelta più restrittiva.

Firme e controfirma dell’operatrice assegnata sono immutabili. Il PDF v3 usa
il worker esistente dopo l’ultima firma; v1/v2 e i relativi byte restano intatti.
Upload/lease/checksum/recupero e download sono riusati; nessun nuovo cron.
Tablet con logout, passaggio successivo a ogni rappresentante dopo nuovo accesso,
retry esatto delle risposte perse e download PDF senza reload. Anteprime delle
etichette pin-scoped, hash e autorizzazione ricontrollati dopo Storage.

Export W19 include prove incomplete/rifiutate/revocate senza hash dei token;
clienti/servizi collegati protetti dall’eliminazione. Migrazione forward 029,
sei tabelle private RLS senza grant diretti, RPC autorizzate e legacy guardate.
Nessun pacchetto pubblicato automaticamente nello studio ufficiale.

Verifiche finali: 683 pgTAP/16 file, 56 unit e 48 E2E passati (14 specifici e
34 regressioni clinica/documenti/privacy/gestione protetta), con sessioni,
Storage e PDF reali locali. Coperti revoca durante attesa del lock, foto più
restrittive, compleanno, ruoli/tenant/origine, risposta persa e tablet. Lint,
TypeScript, build produzione e ripetizione idempotente delle migrazioni passati.
Cliente, data, ora e fuso della seduta sono visibili nelle intestazioni pubbliche
e professionali; in revisione si usano i dati fissati nello snapshot.

Revisione grafica: 27 catture sintetiche locali a 375/820/1280 px (21 pagine
complete e sei dettagli firma/controfirma), tutte aperte e valide, senza overflow
orizzontale. Detector eseguito una volta: zero rilievi. Dopo la review completa,
il solo fix materiale era l’identità temporale della seduta; la verifica finale
lo valuta **risolto**, disposizione `ship` limitata a questa correzione. Ruoli
fresh equivalenti ai reviewer/documenter distribuiti in assenza del relativo
harness specializzato; il reviewer iniziale non era più disponibile dopo il
ripristino dell’ambiente. Sistema grafico e precedenti contratti preservati.

Migrazione 029 applicata al progetto ufficiale `mexokvvvxdyekauupwvt`: tutti i
29 checksum verificati, sei tabelle private con RLS senza grant diretti,
renderer v3 abilitato. Sei cron attivi, reminder e manutenzione `enabled/ok`.
Nessun pacchetto, raccolta o dato di prova creato sul progetto ufficiale;
nessun invio email di prova. Il tag del checkpoint identifica codice e documenti
da pubblicare insieme su `main`; CI e Vercel vanno verificati sul medesimo SHA.

Impeccable resta 4.7.0 per questo incremento. L’utente ha chiesto, con l’ultima
risposta, aggiornamento a 4.8.0 **nel turno successivo**: non aggiornarlo durante
questo rilascio. Un precedente «mantieni» è stato superato da quella risposta.

Restano separati W18 dispositivi fisici avanzati/iPad, W20 backup DB+Storage e
restore/monitor esterno, testi/requisiti specifici prima del pilota e casella
per notifiche tecniche. Non dichiarare R1 o validità normativa universale conclusi.

## Nome studio ed eliminazioni protette — stato corrente

Contratto: [SAFE_MANAGEMENT.md](SAFE_MANAGEMENT.md). Solo titolare:
«Il tuo studio» → «Modifica nome studio»; «Clienti» → scheda → «Elimina
cliente»; «Servizi e sedi» → modifica servizio → «Elimina servizio».
Il nome ha versione dedicata; snapshot e PDF già firmati restano identici.

Nessuna cancellazione di servizi usati da appuntamenti, inclusi passati e
annullati, o modelli clinici anche disattivati. Clienti eliminabili solo senza
appuntamenti, file/dossier o richieste privacy da conservare. Le alternative
restano archiviazione e disattivazione. Conferma esplicita e `ELIMINA` per la
cliente; verifica preventiva e controllo ripetuto sotto lock, versione fissata
all’apertura, idempotenza dopo risposta persa e audit senza nomi/contatti.

Export ancora disponibili/non ripuliti bloccano l’eliminazione. Dopo revoca o
scadenza e pulizia effettiva, i metadati tecnici perdono il riferimento cliente
ma restano fino alla retention ordinaria per intercettare upload tardivi;
non compaiono negli elenchi applicativi. Nessuna nuova coda, file, cron o email.
La cancellazione di dossier clinici resta una procedura distinta e ancora aperta.

Verifiche locali: 640 pgTAP/15 file, 54 unit e 27 E2E pertinenti (11 gestione,
7 applicazione e 9 privacy). Coperti isolamento, ruoli, sospensione durante
attesa reale del lock, associazione dopo preflight, modifiche concorrenti,
offline, focus sicuro, PDF identico e pulizia di upload tardivo dopo cancellazione.
Catture sintetiche: 15 stati a 375/820/1280 px, detector una volta senza rilievi.
Review Impeccable `ship` su tutte le 15 catture, senza correzioni materiali;
ruolo fresh equivalente al reviewer distribuito in assenza del relativo harness
specializzato. Sistema grafico preservato. Lint, TypeScript e build produzione
passati. Migrazione 028 applicata anche al progetto ufficiale: tutti i 28
checksum verificati, sei cron attivi, reminder e manutenzione enabled/ok.
Nessun dato dello studio eliminato e nessuna email di prova inviata.
Lo stato di pubblicazione è verificabile dal tag del checkpoint e dalle
esecuzioni GitHub/Vercel collegate allo stesso commit.

Prossimo incremento pianificato: W20, backup DB+Storage/ripristino e monitor
esterno. Rimangono i gate privacy e dispositivi W18; notifiche tecniche email
in attesa della casella dedicata. Non confondere questo hardening con chiusura R1.

## W19 — stato corrente

Contratto e procedura: [PRIVACY_OPERATIONS.md](PRIVACY_OPERATIONS.md).
«Il tuo studio» → «Gestisci dati e privacy», soltanto titolare. ZIP completo
per cliente con JSON, CSV protetti da formule, foto, etichette e PDF disponibili;
risposte e prove firmate, metadati dei link senza token, esiti messaggi,
conferme/disdette e audit del dossier. Richiede `clinical_access` anche alla
titolare, ricontrollato dopo il lock e prima di restituire il download.

Copie private per 24 ore, revocabili, senza URL pubblici/firmati: limite di tre
copie non revocate per studio, comprese le fallite, due nuove al minuto,
200 allegati, 50 MiB e 2 MiB di metadati. Nessun archivio parziale in caso
di superamento. Retry sullo stesso snapshot e ZIP deterministico, massimo
tre tentativi, senza sovrascritture. Pulizia integrata nel runner esistente
con budget totale dieci; snapshot revocati svuotati subito, scaduti ripuliti
anche dalla retention oraria, metadati delle copie eliminate dopo trenta giorni.
Il monitor include ritardi export in `cleanup_backlog`; nessun nuovo cron/email.

Richieste ricevute/in verifica/conservazione motivata/diniego/ritiro, con
identità verificata e controllo versione. Registrarle non archivia né cancella.
Regole di conservazione versionate e informativa inizialmente vuote: niente
termini inventati. Il testo diventa pubblico in `/informativa/{studio-id}`
solo con conferma esplicita di revisione/pubblicazione; le bozze restano private.
La consegna/accettazione del testo e la distruzione definitiva non sono simulate.

Prima del pilota restano l’approvazione di basi, tempi e testi con il consulente
e la procedura di cancellazione definitiva coerente con prove firmate e backup.
W20 copre backup DB+Storage/ripristino e monitor esterno. W18 iPad e controlli
fisici aggiuntivi restano aperti; le tre sequenze iPhone sono passate per
riscontro utente, senza modello/versione iOS comunicati.

Verifiche: 593 pgTAP/14 file, 54 unit, lint/TypeScript/build produzione;
12 E2E pertinenti, inclusi nove privacy e tre manutenzione, con sessioni,
Storage e PDF reali locali e dati sintetici. Verificata anche revoca clinica
commessa mentre il download attende il lock. Review Impeccable `ship` sulle
nove catture 375/820/1280, detector una volta senza rilievi. Sistema grafico
preservato; nessun nuovo raster pubblico. Migrazione forward 027 applicata
anche al progetto ufficiale e checksum verificato: 27 migrazioni, successiva 028.
Bucket export privato, sei cron ancora attivi, reminder e manutenzione enabled/ok.
Nessun account, email o contenuto clinico di prova creato sul progetto ufficiale.

## W18 — stato corrente

PWA installabile e sempre connessa; iPhone/iPad fisici disponibili all’utente.
Il 21 ottobre l’utente conferma riuscite su iPhone le tre prove richieste in
chat: installazione/riapertura Home, tastiera/rotazione e offline senza coda.
Modello/versione iOS non comunicati; iPad e altri controlli fisici ancora aperti.
Checklist, riproduzione e distinzione fra prove
software/fisiche in [PWA_TEST_PLAN.md](PWA_TEST_PLAN.md). Non segnare W18
completata o R1 chiuso finché mancano gli esiti dei dispositivi. Android fisico
resta da reperire prima del pilota.

Alla riconnessione e al ritorno in primo piano si rivalidano sempre membership,
workspace, clienti, agenda e documenti aperti, anche entro staleTime; le query
secondarie rispettano la propria finestra di freschezza. Nessuna coda di scrittura: bozze in memoria e
retry espliciti restano invariati. Sospensione dell’operatrice verificata alla
ripresa; logout/cronologia non ripristinano lo studio precedente.
Input e textarea su coarse-pointer mantengono 16 px anche su tablet e landscape;
dialoghi con massimo calc(100dvh - 2rem), scroll verticale e azioni raggiungibili.
Identità Glow e componenti shadcn preservati.

Verifiche locali: 43 scenari E2E passati, inclusi 24 PWA su Chromium desktop,
Chromium Android, WebKit iPhone e WebKit iPad; regressioni team, clinica e PDF.
42 unit, build produzione, lint e TypeScript passati. Review Impeccable ship
su 9 catture valide; detector eseguito una volta senza rilievi. Nessun raster
pubblico creato/modificato. Entrambe le esecuzioni CI su GitHub del codice
`9aa3543` sono riuscite; deploy Vercel READY e disponibile su glowlabs.it.
CI installa anche WebKit e lancia la matrice; la sospensione reale iOS e gli
altri controlli fisici non ancora confermati restano nella checklist.

Cloud Debian senza root: download Playwright ufficiale più
`python3 scripts/setup-webkit-cloud.py`, poi test con
`--config playwright.cloud.config.ts`. Librerie dal repository APT snapshot
configurato, con firme/checksum, senza modifiche al browser o flag di skip.
L’helper ha verificato l’avvio reale WebKit 27.2. Riprodurre screenshot con
`GLOW_CLOUD_WEBKIT=1 node --use-env-proxy --import tsx scripts/capture-pwa-ui.ts`
dopo build E2E. Processi e servizi locali vanno riavviati a ogni nuova task.

Nessuna migrazione nuova: restano 26 ufficiali, prossima forward 27. Reminder e
manutenzione restano attivi; notifiche tecniche email attendono la casella.
Nessuna prova email o fixture sul progetto ufficiale per W18.

## Completamento operativo W17 — stato corrente

Contratto e runbook: [OPERATIONS_AUTOMATION.md](OPERATIONS_AUTOMATION.md).
Migrazione forward 026: due heartbeat, cinque tipi di avviso massimo, metadati
HTTP con retention e claim automatico PDF con budget di cinque tentativi.
Job attivi: PDF ogni minuto, pulizia staging/scarti ogni dieci, monitor SQL
ogni cinque. Migrazione 026 ufficiale applicata e checksum verificati due volte.
Manutenzione ON dopo probe OFF e deploy READY del codice `9cede93`.
Tutti i tre cron risultano riusciti alle 13:50 UTC del 20 ottobre;
PDF e pulizia rispondono HTTP 200, health enabled/ok senza arretrati.
Nessun nuovo segreto: riuso della firma HMAC già in Vault/Vercel. Il master reminder rimane ON.

SMTP Auth ufficiale configurato su Resend con template italiani e limite 20/ora.
Accesso e recupero inviati una sola volta ciascuno alla casella autorizzata:
entrambe ricevute nella posta in arrivo, confermato dall’utente. Il recupero
ha richiesto un retry dopo il 429 antiabuso, senza duplicare l’accesso.
Nessuna password modificata, link usato o account ufficiale creato.
Registrazione/conferma e recupero completi verificati localmente con Mailpit
e gli stessi template italiani, con controllo degli oggetti email.

Verifiche locali: 539 pgTAP/13 file e 42 unit passati; Auth, Storage e runner
reminder passati. Il test di crash ha trovato e fatto correggere una
classificazione errata: errore temporaneo di finalizzazione non è integrità.
Undici E2E PDF/manutenzione, sette pulizia/manutenzione e due Auth con template
italiani successivamente passati, incluso recupero automatico
di oggetto già caricato senza sovrascriverlo né richiedere una nuova firma.

Le notifiche tecniche attendono la casella dedicata. W18 su dispositivi reali,
W19 privacy/conservazione e W20 backup/restore/monitor esterno restano aperti.
Le note storiche sotto non prevalgono su questo stato corrente.

## W17 — risposta all’appuntamento

Pagina cliente `/appuntamento#token`, senza account: solo studio, data, orario
e sede, nessun nome cliente/servizio o dato clinico. Lettura e GET/HEAD non
cambiano lo stato; conferma esplicita e disdetta con seconda scelta in linea.
Confermare lascia possibile la disdetta entro il termine. Ricevute idempotenti,
blocco delle altre azioni dopo esito incerto e retry esatto; nessuna coda offline.

Nuovi snapshot Resend v2 includono il link creato atomicamente al primo
dispatch. Storico e chiavi idempotenti invariati; retry riusa lo stesso testo.
Dettaglio agenda: crea/copia/revoca link, WhatsApp manuale e risposte datate;
refresh agenda ogni 30 secondi. Titolare o operatrice assegnata, senza richiedere
permesso clinico. Nei promemoria si configura la disdetta con anticipo 0–168 ore;
default 0 fino all’inizio, modifica valida anche per link già emessi.

Migrazione forward **25**, tre tabelle private/RLS e gateway service-only.
Token casuali 256 bit/hash-only, salvo il testo necessario dello snapshot
email privato; frammento rimosso, no-store/no-referrer. Scadenza al più tardi
all’inizio e dopo massimo 30 giorni; revoca, cambio revisione e sospensione
dell’emittente manuale verificati sul server. Limiti accesso in bucket di
un’ora, nessuna crescita da polling a vuoto. Audit e ricevute conservati per W19.

Contratto, API e limiti in [APPOINTMENT_RESPONSES.md](APPOINTMENT_RESPONSES.md).
Verifiche: 501 pgTAP/12 file, 42 unit e 16 E2E pertinenti passati (7 W17,
9 reminder/Resend), lint/typecheck e build produzione. Review Impeccable:
prima una correzione di focus, poi `ship` sulla correzione; 9 catture valide
e detector una volta senza rilievi. Documenter completato, DESIGN.md e sidecar
preservati senza modifiche. Nessun nuovo raster pubblico.
Non modificare le migrazioni ufficiali applicate; dopo il completamento operativo la prossima è la 27.
Nessuna nuova chiave, fixture ufficiale o email di prova per questo incremento.
Reminder restano **ON**; alert email ancora in attesa della casella dedicata.

## Spazio e registri tecnici — 19 ottobre

Piano Free dichiarato dall’utente; circa 15 MB su 500 MB per il database, circa
0,4 MB nelle tabelle di log operativo al momento della verifica. Migrazione
forward **24** ufficiale applicata e verificata due volte per checksum;
W17 aggiunge la 25, descritta sopra. Non riscrivere migrazioni applicate.

Job `glow-reminder-retention`, `17 * * * *` UTC, attivato senza disattivare
worker/monitor o modificare preferenze degli studi. Prima pulizia manuale
riuscita e configurazione ripetuta senza duplicazioni. `enabled / ok`, zero
allarmi nella verifica successiva; nessuna email di prova o fixture ufficiale.

Run vuoti riusciti e cron riusciti: 7 giorni; errori eliminabili: 30 giorni.
Riferimenti agli invii, run aperti/con lavori, ultimi heartbeat/errori,
outbox, deduplica, webhook, soppressioni, audit e dati clinici preservati.
Invocazioni 7 giorni, nonce 10 minuti; pg_net mantiene il TTL gestito di 6 ore.
Pulizia solo dei job Glow attualmente nominati, al massimo 5.000 righe per
tabella e passaggio. Nessun cambio globale di log o piano Supabase.

CLI scheduler esteso con `--schedule-retention`, `--run-retention`,
`--pause-retention` (utilizzabili a servizio attivo); `--status` aggiunge
manutenzione e dimensioni aggregate. **Non usare `--probe`, `--configure` o
`--schedule` a servizio attivo**: richiedono master OFF. Test: lint, typecheck,
457 pgTAP/11 file passati, inclusi 23 controlli nuovi su protezione delle
evidenze, heartbeat dopo sospensione, isolamento cron e arretrato di 5.001 run.
Dettagli quote/costi e limiti: [REMINDER_LOG_RETENTION.md](REMINDER_LOG_RETENTION.md).
Alert email e notifiche di spazio non configurati: attendere la casella
dedicata. La retention del contenuto applicativo è ancora parte di W19.

## Stato operativo corrente — attivazione del 19 ottobre

L’utente ha chiesto esplicitamente «attiva i reminder», rimandando la casella
per gli alert. Interruttore generale ufficiale **ON** dal 19 ottobre 2026,
09:55 Europe/Rome (07:55 UTC), provider `resend-v1`. I due job ogni minuto
rimangono attivi. Il worker ha completato un’esecuzione reale e la salute è
`enabled / ok`. Non è stata inviata un’email di prova né creata una fixture.

Le preferenze dei singoli studi non vengono modificate dall’attivazione: deve
essere abilitata anche la preferenza dello studio. Nessun recupero retroattivo
dei suoi appuntamenti. Gli alert sono persistiti senza notifiche email;
attendere l’indirizzo dedicato dall’utente prima di configurarle.
Le indicazioni OFF nelle sezioni storiche sotto descrivono le precedenti
consegne, non lo stato attuale. Non disattivare il servizio per ripetere prove
da disabilitato. SMTP Auth e ulteriori verifiche pilota restano separati.

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

Verifica locale: lint, typecheck e build; tredici E2E mirati passati (quattro nuovi
UI/API, sei worker e tre integrazione Resend). Le fixture di storico vengono
rimosse a fine test per non interferire con i worker delle suite successive.
Permessi operatrice/altro studio, proiezione
privata, cursori malformati, pagina con date uguali, salvataggio, offline e
scheda cliente verificati. Impeccable `ship` sulle sette catture a 375/820/1280px;
unico advisory del detector: 11px della navigazione mobile preesistente.
Sistema di stile conservato, nessun asset pubblico aggiunto.

Nessuna migrazione necessaria: ventuno migrazioni immutate. Nessuna fixture
ufficiale o nuova email di prova. Invii automatici ancora disattivati.

## Database e deploy

Ventitré migrazioni `202610150001`–`202610190023` applicate e ri-verificate
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

1. **W16**: completare collaudo operativo e monitor esterno prima del pilota.
   Runner/monitor W16.c presenti; nessuna notifica email per scelta utente. Preferenze/esiti
   W16.b disponibili. Webhook/secret/dominio e inbox verificati. Non chiedere
   duplicati di RESEND_API_KEY. Auth SMTP verificato separatamente. Contratto in EMAIL_DELIVERY.md.
2. W17 e automazione operativa implementati: PDF/pulizia/monitor e SMTP Auth.
   Collegare le notifiche del monitor quando sarà fornita la casella dedicata.
3. W19: export/retention/privacy; poi backup DB+Storage/restore,
   performance, dispositivi fisici, installazione PWA e gate R1.
4. ICS, billing/fatture e funzioni commerciali del piano nelle rispettive fasi.

Non confondere build/test locali, database migrato, push GitHub e deploy Vercel.
Consegna SMTP verificata; non dichiarare completati dispositivi fisici, restore o pilota clinico.

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

## Lotti facoltativi e W16.c — checkpoint corrente

La foto del lotto è facoltativa in UI/API/DB; numero e scadenza obbligatori.
Snapshot null espliciti per ID/hash senza foto, stato scritto in preparazione/
firma/PDF, storico immutabile se la foto viene aggiunta in seguito.
Etichette presenti continuano a richiedere file verificato e corretto tenant/
pigmento. Review Impeccable ship sulle sette catture finali, detector zero
rilievi; sistema di stile invariato.15E2E clinici/documenti/lottosenza foto,
poi nove su lotto/runner/worker e due finali sulle firme del runner passati.

W16.c: cron Supabase separati per worker/monitor ogni minuto, pg_net asincrono
verso route Vercel firmate HMAC; finestra90s e nonce monouso service-only.
Limiti Vercel60s/15s, worker3lavori/budget35s/RPC3s/provider8s.
Chiave generata in Vault e Vercel, mai in Git/log/coda HTTP. Metadata privati
e risposte HTTP controllabili; nessun endpoint di configurazione per utenti.
L’utente ha scelto il monitor **senza notifiche email**: nessun nuovo destinatario
o invio tecnico. Master OFF; probe e scheduler si configurano solo da disattivato.
Runbook e gate rimasti: REMINDER_SCHEDULER.md.

Migrazioni nuove22 (foto facoltativa) e23 (scheduler firmato), nessuna modifica
a quelle già ufficiali.434 pgTAP/10file verificati su reset locale pulito.
Nessuna fixture, account o email di prova sul database ufficiale.

## Evidenza del rilascio operativo — 20 ottobre 2026

Codice `9cede9329d0cca85c95fc4569d7bf5ec77edb683`, deployment Vercel
`dpl_G3HXJ7mNQnDt3XxtQ8s6yktJ2SBC` READY e alias glowlabs.it.
Tre nuovi cron attivi e verificati: PDF ogni minuto, cleanup ogni dieci, monitor
ogni cinque. Primo giro schedulato di tutti e tre riuscito alle 13:50 UTC.
Heartbeat dei worker ok, zero PDF pendenti/da intervenire o pulizie in ritardo.
Reminder sempre ON, tre cron precedenti attivi, ultime due route HTTP 200.
Retention estesa eseguita anche ufficialmente; nessun contenuto clinico eliminato.
Misura alle 13:49 UTC: DB 17.807.027 byte, registri operativi 2.826.240 byte
(circa 2,7 MiB). Non è una previsione di crescita né una prova di restore.

Checkpoint finale: `checkpoint-operations-2026-10-20`. Ripartire da W18 per
collaudo su dispositivi fisici e W19 per privacy/export/conservazione.
Nessuna nuova prova email automatica: le due autorizzate sono già ricevute.
Le email di allarme attendono ancora la casella tecnica dedicata.
