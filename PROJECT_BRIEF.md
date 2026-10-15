# Nextapp — requisiti del nuovo progetto

## Obiettivo

Realizzare una nuova web app per liberi professionisti, utilizzabile da telefono,
tablet e PC, con PWA per l'utilizzo da telefono. L'app gestisce prenotazioni,
appuntamenti e promemoria, oltre alla documentazione dei clienti e dei servizi.

Le analisi del vecchio progetto servono a prevenire il ripetersi degli errori nel
nuovo. Il lavoro richiesto riguarda il nuovo progetto.

## Fonti e stato della lettura

Letti integralmente i due PDF caricati direttamente dall'utente:

- `GlowTrace_Piano_Tecnico.pdf`: 21 pagine, 14 ottobre 2026.
- `GlowTrace_Strategia_e_Marketing.pdf`: 16 pagine, 14 ottobre 2026.

Gli allegati hanno risolto il precedente blocco di accesso ai link Drive.
I rilievi sul vecchio progetto sono attribuiti ai documenti e non costituiscono
un nuovo audit del suo codice. Le richieste dell'utente prevalgono sulle proposte
dei PDF, in particolare per WhatsApp manuale e scelte dei componenti grafici.

La definizione del nuovo progetto è articolata in:

- [SPEC.md](SPEC.md): funzionalità, riferimenti alle pagine e criteri di accettazione.
- [DATA_MODEL.md](DATA_MODEL.md): entità, relazioni, vincoli, RLS e Storage proposti.
- [DECISIONS.md](DECISIONS.md): decisioni, differenze dai PDF, errori da prevenire
  e punti ancora da definire.
- [ARCHITECTURE.md](ARCHITECTURE.md): componenti, confini server/client, integrazione
  Monarch, processi asincroni, connettività e rilascio.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): backlog in 25 consegne con
  dipendenze, criteri di completamento e registro di avanzamento.
- [QUALITY_PLAN.md](QUALITY_PLAN.md): scenari, pipeline, prove reali e gate di rilascio.

## Funzionalità confermate dall'utente

| Area              | Requisito confermato                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Clienti           | Gestione clienti.                                                                                                                          |
| Agenda            | Gestione e prenotazione degli appuntamenti.                                                                                                |
| Reminder email    | Promemoria automatici con outbox affidabile; default proposto 24h, configurabile; provider da scegliere prima degli invii reali.           |
| Reminder WhatsApp | Pulsante nell'app che apre la chat del cliente con un messaggio preimpostato. In questa fase l'invio è manuale.                            |
| Consensi          | Modelli versionati, anamnesi ad accesso ristretto, firma e PDF immutabile recuperabile in caso di errore.                                  |
| Foto              | Gestione delle foto prima e dopo.                                                                                                          |
| Pigmenti          | Gestione dei pigmenti usati nei servizi.                                                                                                   |
| Dispositivi       | Interfaccia utilizzabile da telefono, tablet e PC.                                                                                         |
| PWA | Installabile su telefono/tablet/PC con connessione necessaria. Scelta utente confermata il 15 ottobre 2026: consultazione offline e snapshot agenda esclusi. |

## Scelte tecniche e grafiche richieste

- Next.js con React e shadcn/ui originale: scelta confermata dall'utente dopo il
  confronto con la proposta Nuxt 4 del piano tecnico.
- Supabase per il database e l'ambiente backend. Il progetto ufficiale indicato
  dall'utente è `mexokvvvxdyekauupwvt`; endpoint previsto:
  `https://mexokvvvxdyekauupwvt.supabase.co`. Accesso API e amministrativo SQL
  verificato il 15 ottobre 2026 con le chiavi server e il PAT `Nextapp_token_access`.
  Progetto Nextapp ACTIVE_HEALTHY, regione `eu-west-1`, ruolo SQL postgres con
  permesso CREATE. Public senza tabelle, routine o policy e nessun bucket;
  questo non dichiara vuoti gli schemi interni gestiti da Supabase. Nessuna modifica
  remota eseguita durante la revisione.
  Le credenziali restano nelle impostazioni sicure e non nel repository o browser.
- FullCalendar per il calendario.
- Monarch ufficiale di FullCalendar React 7.1.2, verificato nel repository e nel
  pacchetto npm; integrazione Next.js/React realizzata e verificata in W02.
- shadcn/ui per i componenti dell'interfaccia, integrando FullCalendar per l'agenda.
- Applicare le skill locali quando pertinenti: `frontend-design`, `impeccable` e
  `copywriting`, presenti in `.agents/skills/`.

## Esecuzione del progetto

Seguire IMPLEMENTATION_PLAN.md: base eseguibile → accesso/cataloghi → agenda →
dossier → reminder → PWA/pilota → funzioni della Fase 1 completa. Ogni incremento
comprende schema, permessi, UI e test pertinenti; mantenere CI funzionante e
registrare le evidenze. Lo stato corrente dei singoli item è nel piano.

Restano scelte esterne circoscritte: eventuale self-booking pubblico, hosting e
staging, provider email, contenuti legali/retention e dettagli commerciali/fiscali.
Non impediscono di iniziare la base e i flussi su dati sintetici. Le dipendenze
e il punto in cui ciascuna decisione è necessaria sono nel piano.

Questo brief registra il perimetro completo; lo stato implementativo è nel piano.
Il primo incremento contiene accesso/onboarding, clienti, sedi, servizi, agenda
Monarch, WhatsApp e riepilogo delle sedute. Le prime due migrazioni sono applicate
al progetto ufficiale senza fixture remote. Consensi, foto, pigmenti, invio email
appartengono ai prossimi incrementi; l'app non è ancora il pilota R1.
