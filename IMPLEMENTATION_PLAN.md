# Piano di implementazione — Glow / Nextapp

Revisione: 15 ottobre 2026. Stato: **terzo incremento: team e Storage privato implementati e migrati; R1 da completare**.
Questo file è il backlog operativo: aggiornarlo a ogni consegna con commit,
verifiche eseguite e decisioni. Requisiti: [SPEC.md](SPEC.md); modello dati:
[DATA_MODEL.md](DATA_MODEL.md); architettura: [ARCHITECTURE.md](ARCHITECTURE.md);
qualità: [QUALITY_PLAN.md](QUALITY_PLAN.md).

## Obiettivo e risultato osservabile

Una professionista accede dal proprio dispositivo, configura una sede e un servizio,
registra una cliente, prenota e modifica una seduta, raccoglie anamnesi/consenso/firma,
registra foto e lotti, invia un promemoria email o apre WhatsApp con il testo pronto.
I dati restano isolati dagli altri account, il flusso funziona su telefono/tablet/PC
e la PWA è installabile, con connessione necessaria come confermato dall’utente.

La Fase 1 completa comprende anche feed ICS, diritti sui dati, notifiche alla
professionista, abbonamento e fatturazione previsti dal PDF. Queste funzioni hanno
consegne esplicite; non vengono perse perché non necessarie alla prima demo.

## Stato iniziale verificato

- [x] Letti piano tecnico (21 pagine) e strategia/marketing (16 pagine).
- [x] Stack scelto: Next.js, React, shadcn/ui, Supabase, FullCalendar con Monarch.
- [x] Skill frontend-design, impeccable e copywriting installate nel progetto.
- [x] Monarch trovato nel pacchetto ufficiale FullCalendar React 7.1.2; React 19 supportato.
- [x] Progetto ufficiale `mexokvvvxdyekauupwvt` attivo in `eu-west-1`; PAT
      `Nextapp_token_access` verificato con SQL in lettura e privilegi CREATE.
- [x] Inventario iniziale: public senza tabelle/routine/policy, Storage senza bucket.
- [x] Base applicativa, migrazioni, test automatici e definizione CI.
- [ ] Esecuzione CI su GitHub, staging e distribuzione.

Evidenza del primo incremento: 10 test unitari, 55 pgTAP e 7 scenari browser
su build di produzione superati. Le migrazioni 202610150001/002 sono applicate
al progetto ufficiale, con RLS su otto tabelle e nessun dato sintetico remoto.
Il primo checkpoint GitHub include lockfile, skill, codice, test e configurazione
senza segreti. Stato corrente e ripresa: [DEVELOPMENT_CHECKPOINT.md](DEVELOPMENT_CHECKPOINT.md).

## Metodo di lavoro continuo

1. Selezionare il primo item pronto, con dipendenze completate; una sola attività
   principale in corso per sviluppatore. Non bloccare item indipendenti per un
   provider o una decisione ancora assente.
2. Prima del codice, associare requisito, scenario dimostrabile e test che può
   fallire. Dividere un item che non è dimostrabile in circa 1–2 giorni di sviluppo
   in sotto-attività Wxx.a/Wxx.b; questa è una regola di dimensionamento, non una stima garantita.
3. Completare una porzione verticale: vincoli/schema → autorizzazione/API → UI →
   test e comportamento di errore. Le migrazioni crescono insieme ai flussi.
4. Tenere commit piccoli e build funzionante. Ogni PR include problema risolto,
   migrazioni, verifica e limiti residui; non richiede approvazioni ripetute per
   scelte già autorizzate. Revisione specifica per auth, RLS, token e webhook.
5. Aggiornare stato/evidenze nel backlog e dimostrare il risultato con dati sintetici.
   Se un test fallisce, correggere o registrare un blocco concreto, senza marcarlo completato.
6. A fine incremento rivedere rischi e priorità: misurare tempo di completamento,
   difetti riaperti, fallimenti CI e tempo dei test; usare questi dati per le stime successive.

Stati: `pronto`, `pianificato`, `in corso`, `bloccato` (con motivo e azione),
`verificato`. L'assenza di credenziali di un provider blocca solo la verifica
reale di quel provider; un mock non la sostituisce nella definizione di completato.

## Percorso di consegna

| Traguardo                  | Cosa si può dimostrare                                                                        | Item         |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| M0 — Base eseguibile       | Build, CI, ambiente test e pagina calendario Monarch funzionanti.                             | W01–W03      |
| M1 — Primo utilizzo        | Accesso, owner, sede, servizio, cliente e ruoli testati.                                      | W04–W05, W09 |
| M2 — Agenda operativa      | Prenotazione/modifica/annullamento da più dispositivi, WhatsApp e reporting corretto.         | W06–W08      |
| M3 — Dossier completo      | Link cliente, firma/PDF, anamnesi, lotti e foto con recupero dagli errori.                    | W10–W14      |
| M4 — Promemoria affidabili | Email reali di prova, retry/monitor, conferma e disdetta sicure.                              | W15–W17      |
| M5 — Pilota controllato    | PWA online, export/retention, mobile reale, ripristino e supporto operativo.                  | W18–W20      |
| M6 — Fase 1 completa       | ICS, push, abbonamento e fatturazione pronti e verificati prima dell'attivazione commerciale. | W21–W25      |

Il layout responsive, la qualità e le verifiche di isolamento iniziano in M0/M1
e continuano in ogni item; M5 non è il momento in cui si comincia a testare.
W15 può avanzare già dopo W06 mentre si realizzano i dossier; W21 può iniziare
dopo l'agenda, senza aspettare tutta M5.

## Backlog ordinato e tracciabile

Lo stato corrente è nella tabella seguente e nel registro finale. Gli item
non avviati restano **pianificati**.

| Item             | Stato corrente                        | Limite residuo                                                                                                                       |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| W01              | Verificato localmente                 | Workflow CI definito, run GitHub da verificare dopo push.                                                                            |
| W02              | Verificato nell’incremento            | Monarch reale, quattro viste, viewport desktop/telefono e revisione grafica. Dispositivi fisici in W20.                              |
| W03              | Verificato nell’incremento            | Reset locale, ledger/checksum/lock e RLS provati; schema base applicato al remoto.                                                   |
| W04              | In corso                              | Registrazione, conferma e recupero provati con SMTP locale; SMTP e dominio finale da collaudare.                                     |
| W05              | Implementato, verifiche core superate | Ampliare accettazione su omonime e archivio via UI prima di R1.                                                                      |
| W06              | Verificato nell’incremento            | Concorrenza, idempotenza, sovrapposizioni, versioni e outbox; worker separato in W15.                                                |
| W07              | In corso                              | Agenda/report implementati; drag/resize e stati da ampliare nel collaudo browser. Team migrato e verificato; collaudi fisici in W20. |
| W08              | Verificato nel browser                | Link/chat/testo corretti; apertura sulle app di dispositivi fisici prima di R1.                                                      |
| W09              | Implementato e migrato                | Inviti, sospensione/riattivazione, assegnazioni e RLS testati; migrazioni remote applicate e revisione grafica ship.                 |
| W18              | Implementato, verificato nel browser  | Manifest, istruzioni installazione e rete senza coda; dispositivi reali/HTTPS da collaudare.                                         |
| W10              | Base implementata e verificata        | API, Storage privato, verifica e pulizia recuperabile; scheduler hosting e collegamenti clinici ancora aperti.                       |
| W11              | Implementato e verificato             | Modelli versionati, pigmenti/lotti, etichette e preparazione non firmata. Testi reali da approvare prima del pilota.                 |
| W12–W17, W19–W25 | Pianificato                           | Prossimo incremento: compilazione cliente con link limitato e modalità tablet, poi firma/PDF e foto.                             |

| Item | Consegna concreta                                                                                                                                                             | Dipende da                        | Requisiti                                      | Completato quando                                                                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W01  | Scheletro Next.js/React, TypeScript strict, Tailwind/shadcn, Zod, strumenti test, CI iniziale; manifest PWA minimo; ambiente dev/CI isolato.                                  | Revisione presente                | CI-01, DATA-01, SEC-01, OPS-01                 | Checkout pulito installa da lockfile, lint/typecheck/build passano, app risponde; un test reale esegue codice applicativo. Capacità Docker/Supabase locale verificate o alternativa test identificata. Nessun segreto nel bundle. |
| W02  | Integrazione FullCalendar 7.1.2 + Monarch, token grafici comuni, layout telefono/tablet/PC e navigazione. Applicare frontend-design/impeccable e copywriting dove pertinenti. | W01                               | CAL-01, UX-01, UX-03, UX-04                    | Giorno, settimana, mese/lista e controlli funzionano con fixture dichiarate; CSS/Temporal, locale e fuso corretti; focus e viewport verificati. La prova tecnica viene riusata nell'agenda reale.                                 |
| W03  | Runner migrazioni, schema base tenant/users/ruoli, prima RLS, seed sintetici e harness pgTAP; generazione tipi.                                                               | W01                               | DATA-01, AUTH-02, OPS-02                       | Database test ricreato da zero; runner idempotente con checksum/lock; test con utenti A/B e anon falliscono se si rimuove la policy. Nessun test usa la chiave service per simulare un utente normale.                            |
| W04  | Supabase Auth, recupero password, onboarding owner idempotente, sessioni e redirect autorizzati.                                                                              | W03                               | AUTH-01, AUTH-04, ONB-01, SEC-01, ERR-01       | Utente verificato entra nel proprio tenant; retry/bootstrap non duplica; sessione scaduta e redirect non autorizzato respinti. Test con email locale e prova reale SMTP prima del rilascio.                                       |
| W05  | Clienti, sedi e servizi: UI, ricerca/paginazione, archivio, modifica cataloghi e snapshot dei valori.                                                                         | W04                               | CLI-01, LOC-01, SRV-01, UX-04, PERF-01         | Owner configura una sede/servizio e due clienti omonime; modifiche e archivio restano distinti; niente fetch di tutti i clienti; messaggi e stati UI coerenti.                                                                    |
| W06  | Schema appuntamenti e RPC create/update/cancel, idempotenza, versioni, esclusione e outbox transazionale.                                                                     | W05                               | APT-01, APT-02, APT-03, APT-04, APT-05, MSG-03 | Race di due creazioni e due modifiche testate; rollback lascia dati/coda coerenti; cambio ora coperto. Calendario senza sovrapposizioni anche tra sedi dello stesso operatore.                                                    |
| W07  | Agenda reale, filtri, pannello appuntamento, drag/resize con rollback, vista cliente e report valore sedute.                                                                  | W02, W06, W09                     | CAL-01, REV-01, ERR-01, UX-01, UX-03, PERF-01  | Dal calendario si prenota, sposta, completa e annulla; conflitto mostrato e recuperabile; filtro anni dinamico; nessuna seduta futura negli aggregati dei completati.                                                             |
| W08  | Pulsante WhatsApp con numero internazionale e testo sicuro.                                                                                                                   | W07                               | MSG-02                                         | Si apre la chat corretta su telefono/desktop, testo codificato e privo di dati clinici. Numero mancante/non valido gestito; apertura non segnata come consegna.                                                                   |
| W09  | Inviti, revoca, matrice ruoli, abilitazione clinica e assegnazioni cliente.                                                                                                   | W04, W05                          | AUTH-03, AUTH-05, AUTH-02, ANA-01              | Owner e operatrice hanno permessi previsti; nessuna promozione autonoma, rimozione ultimo owner o accesso a cliente clinica non assegnata. Revoca invalidata online.                                                              |
| W10  | Storage privato e metadati file: staging, validazione, finalizzazione, URL brevi e pulizia orfani.                                                                            | W09                               | PHO-01, AUTH-02, SEC-01, OPS-03                | Upload fallito/ripetuto non lascia riferimenti pronti senza file; file di B non associabili ad A; revoca impedisce nuove URL. MIME, dimensione, nome e oggetto effettivo controllati.                                             |
| W11  | Modelli consenso/questionari versionati, pigmenti/lotti/etichette e dossier preparatorio del trattamento.                                                                     | W05, W09, W10                     | CON-01, ANA-01, PIG-01, PIG-02                 | Testo e label corretti disponibili prima del trattamento; lotto scaduto respinto, storico stabile dopo edit catalogo; audit lettura anamnesi non aggirabile.                                                                      |
| W12  | Link intake limitato, compilazione cliente e modalità tablet isolata; rate limit e consumo atomico.                                                                           | W09, W11                          | LINK-01, UX-02, SEC-01                         | Due invii sullo stesso token producono un solo risultato; GET non consuma; scaduto/revocato respinto. Tablet non espone il dossier di altre persone neppure cambiando URL.                                                        |
| W13  | Firma, snapshot immutabile e generazione PDF asincrona recuperabile.                                                                                                          | W10, W11, W12                     | CON-01, DOC-01, PIG-02, OPS-03                 | PDF contiene testo letto, firma e label pertinenti; documento lungo/accents verificati. Crash dopo firma o upload riparte senza rifirma e senza alterare il documento originario.                                                 |
| W14  | Foto prima/dopo/guarito, acquisizione telefono, confronto e consensi d'uso.                                                                                                   | W10, W09                          | PHO-01, AUTH-02, UX-01                         | Foto reali di prova su iPhone/Android, compressione e orientamento corretti; formato HEIC gestito tramite conversione supportata o errore utilizzabile; nessuna URL pubblica permanente.                                          |
| W15  | Worker outbox, lease, retry/idempotenza provider, gestione esito incerto, heartbeat e allarmi.                                                                                | W06                               | MSG-01, MSG-03, MSG-04, OPS-03                 | Due worker in concorrenza, timeout dopo accettazione e stop del processo superano i test. Nessun retry cieco dell'esito ambiguo; nessun reminder vecchio dopo una modifica non ancora inviata.                                    |
| W16  | Provider email reale, dominio mittente, template, impostazioni reminder, webhook bounce/delivery e inbox di prova.                                                            | W15                               | MSG-01, MSG-05, AUTH-04                        | Email ricevuta in inbox autorizzata; template e fusi corretti; firma webhook e deduplica provate; fallimento definitivo visibile. Auth SMTP testato separatamente.                                                                |
| W17  | Link conferma/disdetta e gestione evento per la professionista.                                                                                                               | W12, W16, W06                     | LINK-02, APT-05, MSG-03                        | Scanner GET non cambia stato; POST conferma/disdetta con revisione e regola temporale valida; evento vecchio o duplicato non regredisce lo stato.                                                                                 |
| W18  | PWA installabile con connessione necessaria e gestione interruzioni.                                                                                                          | W07, W09                          | PWA-01, PWA-02, UX-01, SEC-01                  | Niente coda o snapshot locali; avviso rete assente, invii mai simulati riusciti, riconnessione con dati autorizzati. Installazione HTTPS e dispositivi reali verificati prima del pilota.                                         |
| W19  | Export dati autorizzato, richiesta cancellazione, retention e informazioni privacy.                                                                                           | W09, W10, W13, W14                | RIGHTS-01, ANA-01, PHO-01                      | Export con autorizzazione e file privati a scadenza; CSV resistente a formula injection. Archiviazione e cancellazione distinte; regole di conservazione configurate e revisione dei testi prima di dati reali.                   |
| W20  | Staging/pilota: CI completa, error tracking, health, backup DB+Storage, restore, performance e runbook.                                                                       | W08, W13, W14, W16, W17, W18, W19 | OPS-01, OPS-02, OPS-03, CI-01, PERF-01, UX-03  | Checklist R1 di QUALITY_PLAN superata con evidenze; ripristino riuscito e cronometrato; nessun blocco aperto su isolamento, firma, reminder o perdita dati.                                                                       |
| W21  | Feed ICS personale revocabile e documentazione dei limiti di sincronizzazione.                                                                                                | W07, W09                          | ICS-01                                         | Feed valido, UID stabili, UTC, dettagli minimizzati; revoca interrompe nuove letture; modifica/annullamento coerenti all'aggiornamento del feed. Nessuna promessa di refresh immediato dei client esterni.                        |
| W22  | Push alla professionista con preferenze e fallback email.                                                                                                                     | W17, W18                          | PUSH-01, SEC-01                                | Evento conferma/disdetta raggiunge dispositivo di prova; permesso negato/scadenza sottoscrizione gestiti; payload privato minimizzato. Verifica specifica iOS installata.                                                         |
| W23  | Stripe Billing: Checkout, Portal, webhook idempotenti, entitlement e periodo di grazia.                                                                                       | W04, W19                          | BILL-01, AUTH-05                               | Ciclo di test attivo/insoluto/cessato, eventi duplicati e fuori ordine; accesso in sola lettura applicato anche alle API con export disponibile. Nessun dato eliminato per mancato pagamento.                                     |
| W24  | Processo fatturazione elettronica dell'abbonamento, con fornitore scelto.                                                                                                     | W23                               | BILL-02                                        | Fattura di prova inviata/riconciliata secondo il servizio scelto; scarto e retry gestiti; ricevuta Stripe non dichiarata fattura SdI.                                                                                             |
| W25  | Verifica completa Fase 1 e rilascio commerciale.                                                                                                                              | W20, W21, W22, W23, W24           | OPS-02, OPS-03, CI-01, BILL-01, BILL-02        | Checklist R2 superata, configurazione produzione verificata, smoke post-rilascio e rollback app pronti; promesse marketing corrispondono a ciò che è rilasciato.                                                                  |

## Decisioni e dipendenze esterne, con scadenza tecnica

| Questione                                                                  | Responsabile                           | Serve entro                                                                              | Lavoro che può procedere                                                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-booking cliente oltre alle prenotazioni inserite dalla professionista | Prodotto/utente                        | Prima di promettere un portale pubblico; prima di W06 se deve entrare nel primo rilascio | Baseline assistita, link intake e conferma/disdetta. Se incluso, aggiungere disponibilità, assenze, buffer e prenotazione atomica al backlog. |
| Hosting, dominio app, DNS e ambiente Supabase staging separato             | Implementazione + proprietario account | W16/W20; decidere la destinazione in W01                                                 | Build locale, migrazioni e test sintetici. Nuovi servizi a pagamento richiedono una scelta concreta prima dell'attivazione.                   |
| Provider email, dominio mittente e credenziali                             | Prodotto/operatività                   | W16                                                                                      | W15 con adapter e provider simulato; niente invii dichiarati reali finché non verificati.                                                     |
| Template consenso/anamnesi, regole foto, cancellazione e conservazione     | Prodotto + consulente competente       | W19 e prima di raccogliere dati reali                                                    | Flussi su testi dimostrativi marcati, schema versionato, generazione PDF e test.                                                              |
| Regole disdetta e timing reminder                                          | Prodotto; default tecnici in SPEC      | W16/W17                                                                                  | Regole configurabili e test di confine; 24h come default proposto, non dichiarato scelta definitiva.                                          |
| Prezzi, trial, grazia, Stripe e fornitore fatture                          | Prodotto/amministrazione               | W23/W24                                                                                  | Contratti e test in sandbox senza addebiti reali.                                                                                             |

Non chiedere di nuovo credenziali già funzionanti. Per un blocco nuovo, prima
verificare configurazione e operazione concreta, poi richiedere solo ciò che manca.

## Definition of Ready

Un item può iniziare quando ha requisito/accettazione, flusso e dati in ingresso,
dipendenze disponibili e un piano per verificarlo. Decisioni esterne ancora aperte
sono delimitate e non trasformate in valori inventati. Prima di migrare: diff SQL,
target, comportamento su dati esistenti e strategia di recupero sono espliciti.

## Definition of Done di ogni incremento

- Percorso positivo e fallimenti rilevanti funzionano nell'ambiente previsto.
- Validazione, isolamento, permessi e transazioni coperti dove l'item li tocca.
- UI responsive/accessibile con stati vuoti, errori e recupero; copy coerente.
- Migrazioni, lockfile, tipi e configurazione riproducibili; nessun segreto/dato reale.
- CI pertinente verde con test effettivamente eseguiti; limiti e test manuali non
  eseguiti restano segnalati. Nessun "pass" basato sul solo avvio del processo.
- Documentazione e backlog aggiornati con evidenza; codice morto e fixture demo
  non usate nel flusso reale. Funzione nascosta tramite feature flag se incompleta.

## Rilasci e criteri di prosecuzione

- **R0 — dimostrazione tecnica**: M0/M1 con dati sintetici; nessuna promessa di
  protezione o invio reale provata soltanto con mock.
- **R1 — pilota operativo controllato**: W01–W20 completati e gate di qualità
  superati; nessun addebito automatico necessario. Richiede testi, accessi,
  ambiente remoto e prove di recupero adatti a dati reali.
- **R2 — Fase 1 completa/commerciale**: anche W21–W25 completati. Il successo
  tecnico non sostituisce le decisioni commerciali o fiscali ancora aperte.
- **R3 — evoluzioni**: solo successivamente, per priorità esplicita: self-booking
  se richiesto, WhatsApp automatico ufficiale, Google Calendar bidirezionale,
  stock/consumi pigmenti, caparre, multisessione/tatuaggi/minori, lingue e referral.
  Ogni funzione riceve requisiti, migrazione, test e criterio di valore prima del codice.

## Prossimo incremento

Proseguire W12 con link cliente a scopo limitato e modalità tablet isolata,
riusando le versioni pubblicate e la preparazione W11. Poi W13–W14: firma/PDF e foto.
Seguire [DEVELOPMENT_CHECKPOINT.md](DEVELOPMENT_CHECKPOINT.md) e
[STORAGE.md](STORAGE.md) per contratti e limiti. W04 sul dominio/SMTP reale,
W05/W07 nei collaudi browser residui e scheduler file restano aperti. W15 può
avanzare sulla coda transazionale; nessun invio reale finché provider e
osservabilità non sono verificati. Nessun dato clinico reale prima dei relativi
permessi, flussi e criteri di conservazione.

Per i reminder, [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md) confronta mittente Glow
con Reply-To dello studio, domini dedicati e collegamenti Gmail/Outlook. Il primo
è la proposta iniziale, ancora da confermare; Resend è un’opzione e `noreply` non
è un requisito. Nessun account, dominio a pagamento o invio reale è stato attivato.

## Registro di avanzamento

| Data       | Item                            | Stato                                     | Evidenza / prossimo passo                                                                                                                                        |
| ---------- | ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-15 | Revisione e pianificazione      | Verificato come documentazione            | Specifica, modello, decisioni, architettura e qualità allineati; accessi Supabase e pacchetto Monarch verificati. Nessuna funzione applicativa implementata.     |
| 2026-10-15 | Controllo di coerenza del piano | Verificato come documentazione            | 48 requisiti univoci collegati al backlog, 25 item senza cicli nelle dipendenze, 13 link locali validi nei sette documenti. Non sono test dell'applicazione.     |
| 2026-10-15 | W01–W08, base W09               | Primo incremento verificato, limiti sopra | `npm ci`, lint, typecheck, build, 10 unit, 55 pgTAP, 7 E2E su Supabase locale; quattro viste calendario. Restart/reset e doppia migrazione verificati.           |
| 2026-10-15 | Database ufficiale              | Schema base applicato                     | Due migrazioni con checksum, ripetizione idempotente, otto tabelle RLS, accesso anonimo negato e zero dati di prova.                                             |
| 2026-10-15 | Stile                           | Revisione delle correzioni                | frontend-design/impeccable; detector senza rilievi, screenshot desktop/mobile e controlli touch misurati a 44px; verdetto `ship` sulle due correzioni richieste. |

Aggiornare questo registro con evidenze brevi; gli item non elencati restano
pianificati secondo il backlog. Un cambio di perimetro aggiorna SPEC, decisione,
backlog e test nello stesso incremento.

### Storico: secondo incremento — primo checkpoint GitHub, 15 ottobre 2026

Team, inviti manuali tramite link, accesso sospeso, assegnazioni e guardie di
concorrenza implementati. PWA installabile con rete necessaria: nessuna coda
locale e nessun service worker. Ciclo Auth con email locale e 14 scenari browser
verificati. In quel checkpoint 003/004 e revisione grafica erano ancora aperte;
sono state chiuse nel terzo incremento. Le prove di installazione fisica
restano aperte. Stato corrente in DEVELOPMENT_CHECKPOINT.md. La pubblicazione del codice su
GitHub non costituisce distribuzione dell’app né completamento di R1.

### Terzo incremento — team remoto e base Storage privata, 15 ottobre 2026

Chiusi revisione team (ship/documenter), reset e rollout remoto 003/004, callback
Auth invito e password minima 10. Implementate 005–007: file pending/ready,
verifica/normalizzazione, lettura auditata con URL 30s, pulizia con lease e
controllo del tipo di operazione Storage e riconciliazione degli upload tardivi. Tutte e tre migrate e ripetute sul remoto,
senza fixture. 10 unit, 141 pgTAP e 18 E2E passati, build/lint/tipi superati.
Scheduler remoto, UI foto e dossier non ancora consegnati: prossimi W11–W14.

### Quarto incremento — modelli, pigmenti e preparazione, 15 ottobre 2026

W11 implementato: catalogo clinico con pubblicazioni immutabili, domande tipizzate,
pigmenti/lotti ed etichette private; preparazione non firmata per appuntamento.
Le risposte restano private e ogni lettura è auditata prima di restituirle.
Versioni e snapshot dei lotti rimangono stabili dopo edit del catalogo. La
migrazione 011 serializza accessi clinici e revoche, ricontrollando i permessi
dopo eventuale attesa. Test di contesa reali verificano che una revoca prevalga
su letture e scritture già in attesa. Corretto l’ingombro delle schede su telefono.
Stato ed evidenze definitive in DEVELOPMENT_CHECKPOINT.md. Prossimo W12;
nessuna firma, PDF o email reale dichiarata completata da questa consegna.
