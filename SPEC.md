# Glow — specifica del nuovo progetto

## Fonti e autorità

- **U**: richieste dell'utente in questa conversazione, incluse WhatsApp manuale,
  Supabase, FullCalendar con tema Monarch e shadcn/ui.
- **T**: `GlowTrace_Piano_Tecnico.pdf`, 21 pagine, 14 ottobre 2026.
- **M**: `GlowTrace_Strategia_e_Marketing.pdf`, 16 pagine, 14 ottobre 2026.

Entrambi i PDF sono stati letti integralmente dagli allegati. I riferimenti usano
il numero della pagina PDF. I rilievi sul vecchio repository sono quelli degli
autori dei documenti: non costituiscono un nuovo audit eseguito in questa sessione.
Le indicazioni dell'utente prevalgono sulle proposte dei PDF. Le scelte aggiunte
per rendere implementabili i requisiti sono esplicitate in `DECISIONS.md`.

## Prodotto e perimetro

Web app installabile come PWA, per liberi professionisti, utilizzabile da telefono,
tablet e PC. I PDF propongono come primo pubblico la dermopigmentista che lavora
in più sedi (M pp. 4–5); è un posizionamento suggerito, da confermare, mentre
consensi, foto e pigmenti fanno già parte della richiesta dell'utente.

Si costruisce in `Nextapp`. Non si interviene sul vecchio progetto. Le azioni
commerciali, le soglie di pre-vendita e i contatti esterni dei PDF non autorizzano
invii, addebiti o modifiche a sistemi esistenti.

Stack confermato dall'utente: **Next.js + React + shadcn/ui**, con Supabase e
FullCalendar/Monarch. Questa scelta sostituisce la proposta Nuxt 4 del PDF;
funzionalità e modello dati continuano a seguire il piano con gli adattamenti
espliciti registrati in `DECISIONS.md`.

## Entità e ruoli

- **Tenant**: account professionale proprietario dei dati; può rappresentare la
  professionista o un'organizzazione. Non coincide con una sede fisica.
- **Sede** (`locations`): luogo in cui avviene l'appuntamento, appartenente al tenant.
- **Titolare e operatrice**: ruoli previsti dal piano (T pp. 8, 12). Il titolare
  gestisce utenti e impostazioni; i permessi clinici devono essere espliciti.
- **Cliente finale**: accede soltanto al flusso autorizzato da un link limitato,
  senza accesso all'agenda o all'archivio del tenant.

Modello logico e vincoli: `DATA_MODEL.md`.

## Baseline operativa della revisione

Revisione del 15 ottobre 2026. Le seguenti scelte tecniche permettono di iniziare
senza indovinare regole durante l'implementazione; sono modificabili tramite
`DECISIONS.md` e non sono presentate come citazioni dei PDF:

- Prima interfaccia in italiano, valuta EUR e fuso account Europe/Rome; salvare
  valuta, locale e fuso esplicitamente. Un servizio e un'operatrice per appuntamento,
  più lotti possibili per trattamento, un tenant per login e più sedi per tenant.
- La professionista crea le prenotazioni; la cliente può compilare documenti,
  confermare o chiedere/effettuare la disdetta tramite link con scopo dedicato.
  Un portale nel quale la cliente sceglie autonomamente uno slot rimane una
  decisione di prodotto aperta: il PDF non ne definisce disponibilità e regole.
- Default proposto per email: un promemoria 24 ore prima, configurabile per tenant.
  Se l'appuntamento nasce oltre quella soglia, non spedire un reminder arretrato;
  la UI lo segnala. Conferme immediate e aftercare richiedono regole distinte.
- Stati e permessi sono verificati dal server e dal database, indipendentemente
  da come vengono esposti nell'interfaccia. La UI non è una barriera di sicurezza.
- Per i ricavi, distinguere **valore delle sedute completate** da denaro effettivamente
  incassato: il secondo richiede registrazioni di pagamento, non lo stato completato.

Il piano di lavoro, i rilasci e lo stato del backlog sono in
`IMPLEMENTATION_PLAN.md`; architettura in `ARCHITECTURE.md`, verifiche in `QUALITY_PLAN.md`.

## Requisiti e criteri di accettazione

I criteri seguenti sono da implementare e testare; nessuno è ancora dichiarato
superato. Ogni riferimento **T** indica la fonte del requisito, non un comando
da copiare senza revisione.

| ID | Requisito e fonte | Criterio di accettazione |
| --- | --- | --- |
| AUTH-01 | Identità ricavata da sessione verificata lato server; RLS come seconda difesa (T pp. 10–11). | Senza sessione o con solo un ID nell'header: HTTP 401. Token scaduto o alterato respinto. Utente senza appartenenza autorizzata: 403. |
| AUTH-02 | Isolamento tra tenant su API, database e file (T pp. 11–12, 16, 18). | A non legge, crea collegamenti, aggiorna o cancella risorse di B, anche chiamando direttamente Supabase con il proprio token. Verificare ogni tabella e bucket. |
| AUTH-03 | Ruoli e inviti (T p. 8). | Un'operatrice non può promuoversi, cambiare proprietario o invitare utenti con privilegi superiori ai propri. Inviti scaduti o revocati non attivano accessi. |
| CLI-01 | Anagrafica clienti, identificazione tramite ID, archiviazione con storico (T pp. 3, 12). | Due omonime restano distinte; modificare una non cambia l'altra. Archiviare preserva appuntamenti e documenti; nessun dato personale reale nei seed. |
| LOC-01 | Sedi strutturate, filtrabili nell'agenda (T p. 12; M pp. 4–5). | Lo stesso tenant usa più sedi; un appuntamento può riferire solo una propria sede. La sede non cambia la proprietà dei dati. |
| SRV-01 | Catalogo servizi modificabile (T p. 3; requisito di supporto al modello). | Modifica di prezzo o durata senza cancellare il servizio; appuntamenti e consensi storici mantengono i valori concordati. |
| APT-01 | Appuntamenti con cliente, servizio, sede, operatrice, inizio/fine e stato (T p. 12). | Stati: prenotato, confermato, completato, non presentata, annullato. Fine successiva a inizio; riferimenti appartenenti al tenant; transizioni validate sul server. |
| APT-02 | Sovrapposizioni impedite dal database (T p. 12). | Due richieste simultanee per la stessa operatrice e intervalli sovrapposti non vengono entrambe salvate; intervalli adiacenti sono ammessi. Conflitto restituito come HTTP 409. |
| APT-03 | Salvataggio indipendente dal provider messaggi, con coda transazionale (T pp. 3, 14–15). | Con provider email indisponibile, appuntamento e lavoro da eseguire sono salvati una volta. Ripetere la stessa richiesta idempotente restituisce lo stesso appuntamento. |
| CAL-01 | FullCalendar React 7.1.2, tema Monarch, componenti shadcn/ui (U; pacchetto ufficiale verificato). | Vista giorno/lista su telefono, settimana su PC e mese disponibile; filtro sede/operatrice, creazione/modifica e resize. Uno spostamento rifiutato ripristina l'evento e mostra un errore comprensibile. Testare locale italiano e timezone account. |
| REV-01 | Reporting secondo stati e anno corrente (T pp. 3–4, 12, affinamento della metrica). | Mostrare il valore storico delle sole sedute completate, esclusi appuntamenti futuri, annullati e non presentati; filtro anni dai dati. Non chiamarlo incasso effettivo senza un registro dei pagamenti. |
| MSG-01 | Reminder email automatici (U); outbox dal piano (T pp. 14–15). | Una scadenza produce un lavoro univoco; retry limitati e tracciati. Due worker non acquisiscono contemporaneamente lo stesso lavoro. Pianificazione e provider da definire prima dell'attivazione. |
| MSG-02 | WhatsApp manuale (U, prevale su T pp. 12–15). | Il pulsante apre la chat corretta con telefono internazionale e testo codificato. Non invia autonomamente; l'apertura non viene mostrata come consegna o lettura. Testo privo di anamnesi e dati sanitari. |
| MSG-03 | Spostamenti, annullamenti e cambio ora (T pp. 14–15, 18). | Reminder vecchi annullati e nuovi accodati nella stessa transazione. Prima dell'invio, verificare stato e revisione. Test su Europe/Rome nei cambi di marzo e ottobre e sulla concorrenza con l'annullamento. |
| MSG-04 | Monitoraggio del worker (T p. 15). | Un worker fermo o una coda in ritardo causa un segnale di salute degradato e un allarme operativo; il monitor distingue agenda vuota da elaborazione bloccata. |
| LINK-01 | Link cliente casuale, con hash, scadenza e scopo limitato (T p. 11). | Token scaduto, usato o revocato: HTTP 410. Due invii concorrenti consumano il token una sola volta; scrittura dati e consumo sono atomici. Rate limit e assenza del token nei log. |
| CON-01 | Consensi e modelli versionati, firma e PDF (T p. 16). | Firma da telefono con nome, data e ora server, versione letta e documento conservato. Una nuova versione del modello non cambia i consensi firmati. Non dichiarare qualificata la firma acquisita come immagine. |
| ANA-01 | Anamnesi ad accesso ristretto e audit delle letture (T pp. 6–7, 16, 20). | L'accesso è verificato e registrato senza copiare risposte nei log. Nessuna anamnesi in cache offline, email, WhatsApp, feed calendario o telemetria. Anche gli accessi diretti devono rispettare questo percorso. |
| PHO-01 | Foto prima/dopo/guarito in Storage privato (T pp. 6, 12, 16). | Acquisizione da telefono, compressione prima dell'invio, controlli server su tipo e dimensione. URL firmati brevi; il tenant B non accede a oggetti di A. Consenso all'uso dimostrativo separato. |
| PIG-01 | Pigmenti, lotti e utilizzi per trattamento (T pp. 12, 16). | Ogni lotto contiene numero, scadenza e foto dell'etichetta. Il trattamento registra i lotti effettivi; il documento del cliente conserva le informazioni dell'etichetta pertinenti e la loro versione. |
| PWA-01 | PWA installabile con connessione necessaria (scelta utente, 15 ottobre 2026; sostituisce offline T pp. 6–7). | Manifest, icone 192/512 e maskable, standalone e istruzioni iOS/Android/desktop. Prompt solo se supportato. Installazione su HTTPS/dispositivi reali prima del rilascio. |
| PWA-02 | Perdita di rete e riconnessione, senza modalità offline. | Avviso esplicito, input conservati in memoria per riprovare, nessuna coda automatica di modifiche. Mai mostrare successo senza risposta del server. Esito incerto dopo invio interrotto dichiarato; riconnessione ricarica i dati autorizzati. Niente snapshot agenda o documenti in IndexedDB/service worker. |
| UX-01 | Telefono, tablet, PC (T pp. 6, 8). | Verifiche a 375, 820 e 1280 px senza overflow; navigazione inferiore su telefono, agenda/scheda su tablet, barra laterale su PC, target tattili almeno 44 px. Test reali iOS/Android distinti dai test browser. |
| UX-02 | Modalità cliente su tablet (T p. 6). | Consenso a schermo intero senza dati delle altre clienti; uscita protetta e sessione limitata. Il PIN non sostituisce l'autorizzazione server. |
| DATA-01 | Migrazioni, tipi e verifica dell'isolamento (T pp. 8, 18). | Database ricreabile da migrazioni su istanza vuota; tipi generati coerenti; pgTAP verifica tutte le policy e i collegamenti tra tenant. |
| OPS-01 | Ambienti separati e ripristino (T p. 18). | Prova e produzione su progetti Supabase UE separati; ripristino cronometrato di DB e file, controllo dei riferimenti agli oggetti. Nessun seed reale. |
| ERR-01 | Codici HTTP e stato UI corretti (T pp. 3, 10–11). | Errori realmente 4xx/5xx, senza dettagli Postgres o segreti; caricamento/errore/successo visibili; logout e cambio account invalidano gli store. |

### Requisiti aggiunti per completare i flussi

Questa sezione affina i requisiti precedenti; non estende il prodotto a nuove verticali.

| ID | Requisito | Criterio di accettazione |
| --- | --- | --- |
| AUTH-04 | Ciclo account con Supabase Auth. | Login, verifica email, recupero password e logout verificati; redirect solo verso destinazioni autorizzate. Errori non rivelano se un account esiste. La chiusura della sessione invalida cache e dati delle altre schede. |
| AUTH-05 | Ruoli effettivi e revoca. | Matrice permessi qui sotto applicata a ogni percorso, inclusi API dirette e file. Utente disattivato perde gli accessi online; nessun owner può rimuovere l'ultimo owner attivo. |
| ONB-01 | Primo utilizzo del titolare. | Account verificato → tenant, owner, prima sede e servizio. Ripetere una richiesta o riprendere dopo errore non crea due tenant. Nessun inserimento di tenant/ruolo scelto liberamente dal client. |
| APT-04 | Modifiche simultanee. | Update con versione attesa: due dispositivi che modificano la stessa versione producono un successo e un conflitto 409; la seconda modifica non sovrascrive la prima. La UI offre ricarica/confronto e preserva il testo non salvato. |
| APT-05 | Transizioni, storico e annullamento. | Transizioni esplicite nella tabella sotto; annullamento libera lo slot e annulla lavori futuri. Correzioni di uno stato terminale riservate al titolare e registrate. Un drag non cambia cliente, tenant o stato implicitamente. |
| LINK-02 | Conferma/disdetta da parte della cliente. | Token con scopo e appuntamento dedicati, richiesta POST esplicita; una GET di anteprima o uno scanner email non consuma il link e non modifica appuntamenti. Revisione cambiata, scadenza o stato incompatibile impediscono azioni vecchie. Termine di disdetta configurabile e verificato sul server. |
| DOC-01 | PDF affidabile dopo la firma. | Snapshot firmato, consumo link e lavoro PDF salvati atomicamente nel DB. Fallimento del renderer/upload lascia stato in elaborazione/errore e consente retry senza richiedere una seconda firma. Documento pronto solo dopo verifica dell'oggetto privato e checksum. |
| PIG-02 | Integrità delle informazioni sui lotti. | Lotto scaduto o archiviato non selezionabile per un nuovo trattamento; storico immutato. Le informazioni sono disponibili alla cliente prima della firma/trattamento. Cambiare i lotti dopo firma richiede un nuovo documento pertinente, senza riscrivere quello firmato. |
| MSG-05 | Esiti email e destinatari. | Indirizzo verificato sintatticamente, messaggio generico senza anamnesi/foto/dettagli sanitari, esito provider distinto da consegna. Webhook firmati e idempotenti; bounce definitivo sopprime nuovi invii all'indirizzo e genera un avviso. Invio di test limitato a destinatari di prova. |
| UX-03 | Accessibilità dei flussi principali. | Obiettivo WCAG 2.2 AA: tastiera, focus, etichette, errori associati ai campi, contrasto e lettore schermo. Spostamento appuntamenti disponibile anche tramite modulo, senza obbligo di drag. |
| UX-04 | Stati e navigazione coerenti. | Ogni schermata gestisce vuoto, caricamento, errore, permesso negato e successo; filtri agenda preservati tornando da una scheda. Nessun risultato fittizio mostrato come salvato. |
| SEC-01 | Confine HTTP e browser. | Payload Zod, controlli Origin/CSRF sulle mutazioni con cookie, rate limit persistente per auth/link/upload, CSP e no-store per contenuti riservati. HTML e contenuto rich text non eseguono script; token pubblici non finiscono in referrer, analytics o log. |
| PERF-01 | Query limitate e misurabili. | Lista clienti paginata e ricercabile; agenda carica solo intervallo visibile (massimo 42 giorni per richiesta) con indici tenant/data. Dataset sintetico di almeno 1.000 clienti e 5.000 appuntamenti; target API lettura p95 ≤ 500 ms in ambiente di prova a carico dichiarato. |
| CI-01 | Qualità dal primo incremento. | Installazione da lockfile, lint, typecheck, test pertinenti e build; test DB/API/browser sul database isolato. Nessuna suite a zero test indicata come passata e nessun @ts-ignore introdotto per aggirare errori. |
| OPS-02 | Rilascio e recupero controllati. | Una versione identifica commit, migrazioni e configurazione; migrazioni applicate una sola volta con checksum. App precedente compatibile durante il rilascio; rollback app e ripristino provati in ambiente di test. |
| OPS-03 | Operatività di code e file. | Health check senza dati personali, heartbeat worker, allarmi per ritardo/esiti incerti/errori documenti; runbook con azione, responsabile e prova di recupero. Log tecnici con correlation ID e campi ammessi. |

### Matrice minima dei permessi

Baseline tecnica per un piccolo team; eventuali permessi più granulari saranno
introdotti solo se necessari. RLS e API devono dare lo stesso risultato.

| Operazione | Titolare | Operatrice |
| --- | --- | --- |
| Impostazioni, fatturazione, inviti, ruoli, archiviazione clienti | Sì | No |
| Leggere agenda e anagrafica ordinaria del tenant | Sì | Sì |
| Creare/aggiornare contatti ordinari | Sì | Sì, con audit modifiche |
| Modificare appuntamenti | Tutti nel tenant | Solo propri; assegnazione a terzi riservata al titolare |
| Configurare sedi, servizi, modelli e catalogo pigmenti | Sì | Lettura; scelta dei lotti sul proprio trattamento |
| Anamnesi, foto e documenti clinici | Con abilitazione clinica esplicita | Con abilitazione clinica e assegnazione alla cliente |
| Export completo e richieste di cancellazione | Sì | No |

L'assegnazione alla cliente è esplicita o deriva dall'assegnazione di un
appuntamento; la sua revoca è gestita dal titolare. Abilitazioni e revoche sono
registrate. Gli URL firmati già emessi restano validi fino alla breve scadenza
(massimo proposto 5 minuti); la revoca impedisce subito nuove emissioni online.

### Stati degli appuntamenti

Codici DB proposti in inglese, etichette UI in italiano, enumerati in un solo modulo.

| Stato | Transizioni ordinarie |
| --- | --- |
| `booked` / prenotato | `confirmed`, `cancelled`, `completed`, `no_show` |
| `confirmed` / confermato | `cancelled`, `completed`, `no_show` |
| `cancelled` / annullato | Terminale; nuova prenotazione crea un nuovo appuntamento |
| `completed` / completato | Terminale; correzione motivata dal titolare con audit |
| `no_show` / non presentata | Terminale; correzione motivata dal titolare con audit |

`completed` e `no_show` richiedono che l'orario di inizio sia trascorso.
Correggere uno stato terminale rivalida sovrapposizioni e documenti collegati.
Gli stati terminali non avviano reminder futuri.

## Funzioni complementari della Fase 1 del PDF

Sono assegnate a W19–W25 nel piano; le attivazioni reali dipendono dai dettagli
di prodotto e dai servizi necessari descritti nella relativa consegna.

| ID | Funzione e fonte | Accettazione e decisione aperta |
| --- | --- | --- |
| ICS-01 | Feed calendario personale in sola lettura (T p. 16). | Token segreto revocabile, eventi con UID stabile e UTC, nessun dato sanitario. Il ritardo dei calendari esterni è comunicato; non è sincronizzazione in tempo reale. Definire livello di dettaglio cliente. |
| BILL-01 | Abbonamento Stripe e gestione insoluti (T p. 17). | Checkout/Portal in test, webhook autenticati e idempotenti. Insoluto dopo grazia → sola lettura preservando i dati. Prezzi e durata della grazia ancora da approvare. |
| BILL-02 | Fatture dell'abbonamento (T p. 17). | Definire fornitore e processo fiscale con consulente prima dell'emissione; ricevuta Stripe e fattura elettronica non sono trattate come equivalenti. |
| PUSH-01 | Notifiche alla professionista (T p. 6). | Consenso alle notifiche, supporto dispositivo rilevato e fallback email; payload senza dati sanitari. Richiede flusso reale di conferma/disdetta, non webhook WhatsApp nella versione manuale. |
| RIGHTS-01 | Esportazione e gestione cancellazione (T p. 20). | Export dei soli dati autorizzati; cancellazione coerente con conservazione e storico, distinta dall'archiviazione operativa. Tempi e basi di conservazione da definire. |

## Evoluzioni non incluse automaticamente nella prima consegna

Dal piano T pp. 18–19: magazzino quantitativo e scarichi, caparre con Stripe
Connect, Google Calendar bidirezionale, numero WhatsApp proprio, tatuaggi con
progetti multisessione/minori e localizzazioni aggiuntive. WhatsApp automatico
resta evoluzione possibile rispetto alla scelta manuale dell'utente.

Dal marketing M pp. 11–13: referral, commissioni ad accademie/ambasciatrici,
trial e offerte fondatrici sono ipotesi commerciali da approvare. Non sono
attivate e non costituiscono prerequisiti per scrivere la specifica.

## Ordine di realizzazione e verifiche

1. Verificare in build l'integrazione già identificata: FullCalendar React 7.1.2 e Monarch.
2. Preparare scheletro, TypeScript rigoroso, lint, build e CI.
3. Migrazioni e test RLS/Storage, poi autenticazione e autorizzazioni.
4. Layout responsive e flussi clienti, sedi, servizi, agenda.
5. Link cliente, consensi, anamnesi, foto e lotti con test di isolamento.
6. Email con outbox, WhatsApp manuale e relativi test; PWA e cache isolata.
7. Funzioni Fase 1 aggiuntive secondo dipendenze e decisioni registrate.
8. Verifica browser, dispositivi reali, monitoraggio e ripristino prima del rilascio.

Le migrazioni saranno preparate e verificate prima di applicarle al progetto
Supabase indicato dall'utente. Non è stata richiesta né eseguita alcuna
migrazione di dati dal vecchio sistema.
