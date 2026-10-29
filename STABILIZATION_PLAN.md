# Glow — priorità della revisione e piano di stabilizzazione

Data: **29 ottobre 2026**. Base verificata: repository al commit `53d0f76`;
il piano privacy del 28 ottobre è preservato e integrato, non sostituito.
Stato al 29 ottobre 2026: **primo incremento implementato**, con verifiche locali e
rilascio tracciati in [STABILIZATION_IMPLEMENTATION.md](STABILIZATION_IMPLEMENTATION.md).
Il piano completo S00–S09 resta aperto; non equivale al via libera ai dati reali.

| Task | Stato del primo incremento |
| --- | --- |
| S00 | Baseline locale autenticata: 1.000 clienti, 5.000 appuntamenti, 10 sessioni concorrenti; misure prima/dopo. Cold start e futuro VPS da misurare separatamente |
| S01 | Implementati gateway pubblico, quote per origine/token/studio e pulizia a lotti; test di abuso solo locali |
| S02 | Aperto: destinazione off-site, chiavi e accesso PostgreSQL per backup/restore completi da definire; nessun backup operativo dichiarato |
| S03 | Gate sullo SHA verificato implementato; automazione richiede Actions secret VERCEL_TOKEN. Staging separato e configurazione scheduler restano da completare |
| S04 | Implementati JWT verificato, profilo/sessione Auth corrente e deduplicazione nel render; regressioni di revoca/isolation coperte |
| S05 | Implementati debounce, elenco stabile, membership leggera, polling condizionale e intervallo agenda iniziale. Lazy editor rinviati in assenza di beneficio misurato |
| S06 | Implementati lock tenant compatibili con FK, sei indici e quota file per tenant. Retention legale generale e monitor indipendente restano aperti |
| S07/S08 | Aperti: verifica destinatario, MFA/CSP e procedure privacy/incidenti applicabili |
| S09 | Destinazione Hostinger confermata, nessun VPS acquistato o configurato |

## Richiesta e autorità delle fonti

L’utente chiede di selezionare i problemi urgenti del report
`Glow_Revisione_2026-10-28.pdf` e pianificarne la soluzione.
Il PDF è stato letto integralmente, **12 pagine**. SHA-256:
`d0a53914595582242b2d387ca9ed6c6354c986a98a667f6d0fa034d95178f939`.
Le pagine citate sotto sono quelle numerate nel PDF.

Il report è una revisione esterna: suggerimenti, snippet, prezzi, stime di ore,
giudizi sulla sicurezza e misure pubbliche non sono istruzioni da eseguire né
risultati di una nuova prova di questo agente. Non sono autorizzati dal PDF
acquisti, cambi di visibilità del repository, contatti commerciali o invii.

**Decisione esplicita dell’utente:** al passaggio a produzione con il gruppo
iniziale di **3–5 utenti**, ospitare l’app su un **VPS cloud privato Hostinger**.
Non si presume che “utenti” significhi studi distinti né che siano tutti simultanei.
Next.js/React, shadcn/ui, FullCalendar e PWA online restano le scelte esistenti.
Supabase resta DB/Auth/Storage designato; il trasferimento del database sul VPS
non è stato richiesto. Hostinger è la destinazione scelta, con regione, contratto,
configurazione e costi ancora da validare.

Preparare il VPS prima dell’attivazione del gruppo reale. La soglia 3–5 è una
decisione di rilascio, non un’esenzione privacy per i primi utenti: fino ai gate
di idoneità, proseguire con i dati sintetici già confermati dall’utente. Anche
l’eventuale uso reale del solo studio della sorella richiede quei prerequisiti.

## Rilievi selezionati e riscontro

“Confermato” significa riscontro nel codice, non attacco o benchmark eseguito
in produzione. I tempi dopo login e il comportamento sotto carico restano da misurare.

| Report | Riscontro su Glow | Decisione |
| --- | --- | --- |
| §3.2, p. 7: blocco globale dei link | Confermati contatori `global` a 300/min prima della validazione del token nelle RPC intake, firma, pacchetti e risposta appuntamento. Ci sono tabelle distinte per famiglia; firma e pacchetti condividono `signature_rate_limits` | **S01, primo difetto da correggere**: abuso di un flusso non deve bloccare gli utenti legittimi della stessa famiglia o altri studi |
| §3.1, p. 7: recupero dati | W20 e prova di restore DB+Storage ancora aperti; non è documentata una procedura verificata | **S02, bloccante prima dei dati reali**; non si deduce che eventuali copie esterne non documentate esistano o funzionino |
| §2A–D, pp. 4–6: lentezza | Confermati `getUser()` in proxy e session helper, profilo separato, doppio caricamento workspace, polling e `useDeferredValue` senza debounce; assenti `loading.tsx` | **S00/S04/S05**: baseline autenticata, poi interventi misurati. Le misure pubbliche del PDF non provano i tempi dell’agenda dopo login |
| §3.4, pp. 7–8: lock | Confermato `FOR UPDATE` sul tenant anche nella lettura di link; più flussi serializzano revoca, permessi, prove e audit | **S06**: valutare lock meno forti con test reali di concorrenza; nessuna rimozione generalizzata |
| §3.3, p. 7: identità del firmatario | I link sono bearer capability; il vecchio percorso accetta un nome immesso. I nuovi pacchetti hanno invece identità/rappresentanza verificate dallo studio e controfirma, ma manca la verifica remota OTP del destinatario | **S07**, integrata con CP-03. Distinguere percorsi e modalità tablet/link; nessuna promessa di firma qualificata |
| §3.5, p. 8: deploy prima dei test | Il workflow `ci.yml` verifica i push; non contiene un deploy subordinato ai risultati. L’autodeploy Vercel del rilascio precedente era indipendente | **S03**: promozione del solo SHA verificato. Protezione attuale del ramo riferita dal PDF, da riesaminare all’attuazione |
| §3.6, p. 8: indici/log | Confermati indice audit per tenant/data, conteggi `file.read` senza tenant nel predicato e assenza di una policy di cancellazione generale dell’audit. Retention tecnica esistente esclude outbox/prove | **S06 + CP-04**: misure, indici pertinenti, limiti di spazio e conservazione approvata; niente cancellazioni indistinte |
| §3.8, p. 8: staging | Confermati dominio negli scheduler SQL e allowlist del progetto nei moduli server | **S03**. Non tutto è un reindirizzamento alla produzione: varie guardie rifiutano un progetto diverso con 503. Rischi diversi da trattare separatamente |
| §3.7 e §3.9, pp. 8–9: sicurezza/diritti | Nessun flusso MFA o CSP individuato; monitor indipendente, distruzione dei dossier e uscita studio restano aperti | **S08**, con CP-02–06 e W20, prima del pilota reale |
| §3.10, p. 9: documentazione email | `DEPLOYMENT.md` riporta ancora SMTP da configurare/limiti vecchi; `OPERATIONS_AUTOMATION.md` descrive la configurazione Resend successiva | Allineare in **S03**; quote reali da verificare prima di aggiungere traffico OTP, senza alzarle alla cieca |
| §4.1, p. 10: Vercel Pro | Non sufficiente per i vincoli sulle categorie particolari del DPA già rilevati in CP-00 | Destinazione **Hostinger VPS**, come deciso dall’utente, previa idoneità contrattuale; nessun acquisto Vercel Pro come soluzione automatica |

Riferimenti principali nel codice: `src/proxy.ts`, `src/server/session.ts`,
`src/components/{providers,app-shell}.tsx`, `src/app/app/clienti/page.tsx`,
`src/features/agenda/agenda.tsx`, pannelli intake/consensi e migrazioni
012/013/025/029. Il contratto dei pacchetti è in `DEFAULT_CONSENTS.md`.

## Ordine di lavoro

Due percorsi coordinati: **S01–S06 stabilizzano il software adesso**;
**S02/S03/S07/S08/S09 chiudono i prerequisiti del pilota**. I lavori su informative
e contratti possono avanzare in parallelo, sempre su dati sintetici.

| ID | Priorità e momento | Risultato verificabile | Dipendenze principali |
| --- | --- | --- | --- |
| S00 | P1, baseline iniziale | Misure autenticate e inventario query/chiamate | Ambiente locale/staging sintetico; prepara S04–06 |
| S01 | **P0, primo fix** | Rate limit isolati e resistenti all’abuso | Nessuna migrazione hosting necessaria; adapter IP compatibile col futuro proxy VPS |
| S02 | **P0, prima dei dati reali** | Backup DB+file, manifest e restore provato | W20/CP-05; destinazione cifrata separata dal server |
| S03 | **P0, prima del rilascio reale** | Configurazione ambienti isolata e deploy dopo CI | Prepara staging e S09; include runbook/documenti aggiornati |
| S04 | P1, subito dopo baseline | Meno verifiche Auth e letture duplicate | S00; mantiene sospensione e autorizzazioni |
| S05 | P1, dopo S04 | Meno richieste inutili, navigazione e liste stabili | S00/S04; tutela PWA e documenti in attesa |
| S06 | P1, prima del gruppo reale | Contesa e query misurate; indici e spazio sotto controllo | S00, test di concorrenza e CP-04 per retention |
| S07 | **P0 per link sanitari remoti reali** | Verifica del destinatario prima della visualizzazione sensibile e della firma | S01, S03, CP-03; quote email/SMS e modalità tablet definite |
| S08 | **P0, prima del pilota reale** | Privacy, accessi, incidenti e monitor operativi | CP-00–07, W18/W20 e S02/S07 |
| S09 | **P0 al passaggio in produzione** | Hostinger pronto, cutover e rollback provati | S01–08 applicabili chiusi; idoneità contratto/regione e budget |

Non si adottano le stime in ore o il calendario di tre settimane del PDF come
impegni. Ogni incremento termina con diff verificabile, test pertinenti,
documentazione e checkpoint; le stime si affinano dopo baseline e disegno tecnico.

## S01 — impedire il blocco dei link di altri utenti

- Applicare limiti per origine della richiesta e capability, e per studio dopo
  averlo ricavato da un token valido. Mai fidarsi di un tenant passato dal chiamante.
- L’IP deve provenire da un proxy fidato: definire adapter Vercel attuale e
  reverse proxy Hostinger futuro. Ignorare header inoltrati falsificabili dal client;
  il server applicativo non sarà raggiungibile direttamente da Internet sul VPS.
- Minimizzare l’IP con HMAC e segreto server, finestra breve, retention e limiti
  di cardinalità. Un hash semplice di IPv4 non garantisce anonimato. Evitare una
  nuova riga per ogni token casuale inesistente; nessun IP/token nei normali log.
- Rimuovere il limite rigido condiviso che l’input invalido può consumare.
  Anche la telemetria non deve scrivere una riga globale contesa a ogni richiesta.
  Prevedere protezione di capacità separata e monitor, senza ricreare il blocco comune.
- Mantenere quote token, scadenza, revoca, risposte non enumerabili e idempotenza.
  Valutare NAT condivisi dello studio e richieste lecite di più rappresentanti.
- Spostare la pulizia delle finestre nel runner esistente con lotti limitati;
  nessun DELETE esteso su ogni apertura e nessun cron aggiunto inutilmente.

Accettazione: solo su ambiente isolato, traffico invalido superiore alla vecchia
soglia mentre due studi usano link validi; i secondi proseguono. Coprire intake,
firme legacy, pacchetti, label e conferma/disdetta; token abusato isolato,
header IP falsificato inefficace, conteggi atomici e finestre ripulite. Verificare
anche chiamate RPC dirette e privilegi; nessun percorso aggirabile con anon key.

## S00/S04/S05 — prestazioni senza perdere controlli

### Prima misurare

Usare almeno 1.000 clienti e 5.000 appuntamenti sintetici, 10 sessioni simultanee,
più una prova rappresentativa del gruppo di 3–5 utenti. Rilevare richieste Auth,
profilo/query, tempi di navigazione, richieste/minuto e bundle, separando freddo
e caldo. Server-Timing con nomi fissi e durate, senza dati personali o token.
Registrare regione, risorse, rete e commit: le misure pubbliche del report non
sono una baseline riproducibile dell’area autenticata.

Obiettivi già di progetto: letture API p95 ≤500 ms e scritture p95 ≤1 s sotto il
carico dichiarato. Misurare a parte il tempo percepito nell’interfaccia e l’avvio
a freddo; non promettere quei valori sul solo cambiamento di una funzione Auth.

### S04 — sessione e workspace

- Verificare libreria installata, firma JWT/JWKS, scadenze e semantica di revoca;
  valutare `getClaims()` per le letture dove appropriato. Non basta decodificare
  un JWT e il primo recupero JWKS/refresh può richiedere rete.
- Deduplicare il lavoro all’interno della singola richiesta/render, senza cache
  globale di sessioni, profili, dati clinici o permessi tra utenti/richieste.
- Mantenere controlli aggiornati per inviti/email verificata e azioni sensibili.
  Il cambio da verifica remota a JWT locale può modificare la revoca della
  sessione prima della scadenza: definire e testare il comportamento prima del merge.
- Conservare controllo attuale `users.active`, tenant, ruolo/assegnazione e
  verifiche DB dopo i lock. Una parallelizzazione non deve restituire dati prima
  dell’autorizzazione né aggirare l’audit obbligatorio.
- Ridurre selezioni e doppie letture layout/API con dati iniziali/hydration
  coerenti e query key per utente/studio; nessun dato di A riusato dopo logout in B.

### S05 — polling e interfaccia

- Separare la verifica leggera di membership dal caricamento completo del
  workspace; ridurre richieste periodiche senza eliminare la rilevazione della
  sospensione quando l’utente rimane su una schermata inattiva. Il 403 di una
  futura API da solo non basta a coprire quel caso. Conservare il controllo
  periodico attuale di 15 s mentre la pagina è attiva/online, rendendolo più
  leggero, o dimostrare una soluzione equivalente; nuove letture server sempre autorizzate.
- Focus/reconnect forzati solo dove necessari, rispettando staleTime altrove;
  mantenere le garanzie della PWA al rientro e svuotare cache su revoca/logout.
- Arrestare il polling dei link soltanto quando non resta lavoro da osservare:
  **firma ricevuta non significa PDF pronto**. Riprenderlo se c’è un nuovo link,
  una rigenerazione o un nuovo documento. Nessuna nuova raccolta via polling auditato.
- Calcolare intervallo iniziale agenda prima del mount del calendario, coerente
  con vista mobile/desktop, sede, fuso, cambio ora e navigazione FullCalendar.
- Debounce ricerca circa 300 ms; mantenere le liste durante cambi di pagina/filtro
  con indicazione del caricamento e azioni sicure sui dati mostrati. Non trattenere
  dati di un’altra identità dopo revoca/cambio sessione.
- Loading di route, stati vuoti/errori/offline e caricamento differito di editor
  e dettagli; nessuna modifica all’identità visiva Glow. Ottimizzare bundle o
  login statico soltanto se l’analisi ne dimostra il beneficio.

Accettazione: misure prima/dopo, typing rapido con richieste accorpate, cambio
settimana/fuso senza risultati errati, rientro da sospensione PWA, revoca senza
altre azioni e PDF ancora recuperabile dopo firma. Test di isolamento, sessioni
scadute e autenticazione restano verdi; review Impeccable per le future modifiche UI.

## S02 — backup che permettono di recuperare un dossier

Integra CP-05/W20. Valutare piano Supabase e storage off-site in base ai requisiti,
senza assumere che pagare un piano renda automaticamente recuperabili i file.

- Copie cifrate di DB e oggetti Storage, manifest con hash e riferimenti,
  retention, chiavi separate e credenziali minime; mai backup reali nel repository.
- Esercitare restore in progetto isolato: riconciliare righe/oggetti, prove,
  PDF, foto, permessi e revoche; distinguere file mancanti/orfani. Provare anche
  che l’applicazione delle cancellazioni non sia annullata dal ripristino.
- Non riattivare cron o invii ripristinati su un ambiente di test. Verificare
  stato outbox e riconciliazione con il provider prima di eventuali retry reali.
- Verificare RPO ≤24 h e RTO ≤4 h già proposti; documentare lo scarto se non
  raggiunti e l’esito della revisione del requisito. Snapshot del solo VPS non
  sono backup di Supabase DB+Storage.

Accettazione: dossier sintetico completo recuperato, confronto degli hash,
permessi corretti, tempi e procedura ripetibile da una seconda persona autorizzata.

## S03 — ambiente corretto e rilascio solo dopo i controlli

- Configurazione separata per locale, staging e produzione: URL app/progetto,
  credenziali, domini email, scheduler e webhook. Allowlist esplicite e rifiuto
  dei mismatch, non eliminazione delle protezioni sui service client.
- Rendere configurabili i nuovi scheduler/link senza cambiare migrazioni già
  applicate o payload storici firmati. Staging con proprie chiavi e destinatari
  di prova; nessun fallback silenzioso a DB, dominio o invii di produzione.
- Promuovere l’artefatto identificato dal **medesimo SHA che ha passato CI**.
  Un workflow solo “push → test” non impedisce un autodeploy indipendente.
  Definire protezioni di main e percorso revisione/push compatibili col lavoro
  dell’utente; branch protection da sola non trattiene un autodeploy al push.
- Sul VPS distribuire immagine/artefatto verificato, migrazioni forward con
  checksum, health/readiness, limite delle versioni conservate e rollback app.
  Una CI rossa non deve cambiare l’ambiente attivo.
- Allineare DEPLOYMENT, SMTP/quote email, scheduler, documenti obsoleti e runbook
  breve: firma senza PDF, reminder fermo, utente bloccato, credenziale e restore.
  Provare almeno recupero PDF e fermo/ripresa worker senza duplicati su staging.

Accettazione: test con SHA volutamente rosso rimane fuori produzione; staging
non può indirizzare produzione anche con configurazione incompleta; rollback
provato con schema compatibile. Nessun segreto in log o artefatti pubblici.

## S06 — concorrenza, indici e crescita dei dati

- Misurare contesa e piani delle query su dataset sintetico. `FOR NO KEY UPDATE`
  può evitare conflitti con FK `KEY SHARE`, ma serializza ancora chi prende lo
  stesso lock: non elimina da solo tutta la contesa del tenant.
- Rivedere funzione per funzione l’ordine tenant → appuntamento → link/preparazione
  e le verifiche dopo attesa. Una lettura che registra audit o verifica revoche
  non è automaticamente priva di effetti. Nessuna rimozione indiscriminata dei lock.
- Aggiungere indici con selettività misurata: candidati per tenant/client su
  consensi/preparazioni, tenant/servizio e tenant/sede su appuntamenti, attore/
  azione/data e risorsa sull’audit. Riutilizzare indici compositi già adatti;
  non creare duplicati o indici a costo di scrittura senza query beneficiarie.
- Aggiungere tenant ai conteggi dove coerente con l’autorizzazione e considerare
  contatori dedicati anziché scansioni dello storico per throttling.
- Separare retention tecnica da prove, audit di diritti e obblighi di conservazione.
  CP-04 approva cosa eliminare; pulizia a lotti, indici e legal hold. Evitare audit
  di scritture realmente identiche senza sopprimere eventi di sicurezza necessari.
- Misurare DB, indici, file, outbox e log; soglie/configurazione di avviso senza
  dati clienti, frequenza contenuta e destinatario tecnico quando disponibile.
  La stima di 11 settimane per 1 GB nel report non è un consumo già osservato.

Accettazione: test con revoca/sospensione durante attesa, accessi file, firme,
controfirme, nuovi legami prima di eliminazione ed email concorrenti. Nessuna
divulgazione post-revoca, deadlock o duplicato; EXPLAIN prima/dopo e crescita limitata.

## S07/S08 — destinatario, accessi e conformità

Integrare CP-00–07, senza duplicare la revisione legale in un secondo piano.

- Verifica remota prima della lettura di dati sanitari e della firma: disegnare
  OTP sul contatto verificato dello specifico firmatario, mai solo sul recapito
  suggerito dal visitatore o della minorenne al posto del rappresentante.
  Codici con hash, scadenza, tentativi limitati, blocco/rinvio, sessione breve
  legata alla raccolta e revoca/rotazione coerente. Mai salvare il codice nella prova.
- Per il tablet mantenere consegna in presenza, logout professionista e verifiche
  di identità/ruolo. Non imporre un’email o SMS alla cliente come surrogato della
  verifica in presenza senza aver valutato necessità e recupero.
- L’OTP prova il controllo di un canale, non da solo identità civile, poteri
  genitoriali o firma qualificata. IP/user agent non sono automaticamente prove
  sufficienti o dati da conservare per sempre: eventuale raccolta richiede scopo,
  informativa, minimizzazione e conservazione concordati.
- Non cambiare renderer o byte delle vecchie prove per aggiungere metadati.
  Nuova prova versionata; test di link inoltrato, destinatario errato, due
  rappresentanti, perdita risposta, OTP errato/scaduto e limiti invii condivisi
  con Auth/reminder. Nessun OTP o test inviato realmente in questa pianificazione.
- MFA titolare/amministratori con recupero sicuro, CSP compatibile con Next.js
  e FullCalendar, monitor esterno e segnalazione errori minimizzata. Evitare
  session replay, payload di moduli e URL con capability nell’error tracking.
- Informative e termini, accordi art. 28, basi/consensi uniformi anche nei flussi
  legacy, minori/regione, diritti/cancellazione e uscita studio: chiudere i task
  CP pertinenti prima del pilota. Non serve una firma del DPO per ogni testo;
  individuare il professionista competente e i soggetti responsabili effettivi.

Accettazione: canale non verificato non legge anamnesi/PDF; link inoltrato da solo
non basta; flusso tablet e recupero dei documenti restano funzionanti. Evidenze
tecniche e validazione privacy/settoriale sono due risultati distinti.

## S09 — produzione Hostinger VPS per il gruppo di 3–5 utenti

### Prima del server

Confermare prodotto VPS, datacenter EEA, DPA e ammissibilità dei dati previsti,
subfornitori/accesso supporto, costi e responsabilità operative. “VPS privato”
non garantisce da solo conformità, gestione sistemistica o alta disponibilità.
Il piano di un singolo VPS deve comprendere il rischio di guasto e il recupero.

Preventivo completo: VPS, backup separati, Supabase, email/OTP, monitor e gestione;
niente assunzione dei 45–65 $/mese o dei piani citati nel report. Dimensionare
con benchmark, non con il solo numero di account. Nessun acquisto in questo turno.

### Preparazione riproducibile

- App/API/SSR/PDF sul VPS con Node supportato dal progetto e build riproducibile,
  reverse proxy TLS, process supervision/container, restart e spegnimento ordinati.
  Verificare font PDF, sharp, memoria e lease dei job dopo un riavvio.
- Solo porte web pubbliche, amministrazione con chiavi/accessi limitati,
  aggiornamenti OS, segreti esterni al repository, log a rotazione e monitor disco.
  Header IP normalizzati dal proxy per S01, nessuna cache condivisa di dati privati.
- Mantenere `glowlabs.it`, URL e manifest PWA, Auth/cookie, redirect, inviti,
  capability, Resend/webhook e endpoint firmati compatibili. DNS, TLS e chiavi
  verificati su staging prima del cambio.
- Un solo orchestratore per ogni lavoro: preferire inizialmente i cron Supabase
  già esistenti diretti al dominio, se compatibili. Non creare cron VPS paralleli
  che inviino gli stessi reminder; provare lease, nonce e invii incerti al cutover.
- Backup off-site e monitor fuori dal VPS; essere in grado di ricostruire il
  server, non soltanto riavviarlo. Staging isolato e non inizializzato con dati reali.

### Cutover e accettazione

Fare inventario job/versioni, backup verificato, rilascio compatibile e finestra
di passaggio; controllare DNS/TLS, login, scrittura, firma, PDF, foto, export e
webhook. Provare fermo/ripartenza durante un job e assenza di email duplicate.
Definire criteri di arresto, rollback dell’artefatto e strategia di recupero
infrastrutturale. Dopo dati reali, il ritorno a un hosting non idoneo non è un
rollback accettabile: predisporre una versione precedente sul VPS idoneo.

R1 richiede evidenze di CI, autorizzazione, recupero, prestazioni, contratti e
consensi; il raggiungimento di 3–5 utenti da solo non chiude il gate.

## Cosa rinviare o correggere nell’interpretazione del report

- **Vetrina, Stripe e automazione SdI:** dopo stabilizzazione/primi piloti secondo
  il prodotto. L’integrazione può aspettare; gli obblighi fiscali applicabili al
  primo incasso no. “Fattura manuale” non equivale a poter emettere una fattura
  cartacea quando è dovuta quella elettronica: verificare con il commercialista.
- **Repository privato:** scelta commerciale/IP, non correzione di una falla
  dimostrata. Codice pubblico non sostituisce le difese, e renderlo privato non
  le crea. Nessun cambio di visibilità o dichiarazione di scansione completa
  delle chiavi effettuata da questa analisi.
- **Politiche RLS, bundle e login statico:** misurare prima. Non trasformare una
  proposta EXPLAIN o una dipendenza sospetta in un problema prestazionale provato.
- **DPIA, OTP e validità del consenso:** screening/valutazione come da CP-01/03;
  nessuna attestazione legale derivata da un controllo tecnico aggiunto.
- **Mercato/20 conversazioni/stop a 30 giorni/prezzi:** proposte dell’autore del
  PDF, non decisioni dell’utente. Nessun contatto, pagamento o marketing avviato.

## Metodo e punto di ripresa

Proseguire da **S02** e completare S03 dopo questo incremento S01/S04/S05; poi
S06 e prerequisiti privacy/firma; preparazione Hostinger S09 prima dell’attivazione
reale. Per ogni task: esito atteso, test che fallisce prima ove pertinente,
modifica minima, verifica, migrazione forward quando necessaria e checkpoint.
Non modificare migrazioni 001–029 già applicate; nessun reset o fixture sul DB ufficiale.

La fase iniziale ha confrontato il PDF con le sorgenti senza eseguire prove
remote. Il successivo incremento autorizzato ha raccolto misure e test locali:
esiti e stato di pubblicazione in STABILIZATION_IMPLEMENTATION.md. I criteri
ancora aperti sopra restano gate, non risultati già ottenuti.
