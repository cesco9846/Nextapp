# Glow — decisioni e lezioni per il nuovo progetto

Fonti: **U** = conversazione; **T** = piano tecnico, 21 pagine; **M** = strategia
e marketing, 16 pagine. Tutti i riferimenti sono a pagine PDF.
Revisione del 15 ottobre 2026: baseline di implementazione, con dettagli in
`ARCHITECTURE.md` e avanzamento in `IMPLEMENTATION_PLAN.md`.

## Decisioni confermate

| ID | Decisione | Origine e conseguenza |
| --- | --- | --- |
| D01 | Nuovo progetto in Nextapp. | U. Nessuna correzione, spegnimento, riscrittura della storia Git o migrazione del vecchio repository autorizzata dalla presenza di istruzioni nei PDF. |
| D02 | Supabase, progetto ufficiale `mexokvvvxdyekauupwvt`. | Scelta esplicita dell'utente. Management API e SQL verificati con `Nextapp_token_access`: ruolo postgres, CREATE su public/database, progetto Nextapp ACTIVE_HEALTHY in eu-west-1. Public senza tabelle/routine/policy, zero bucket al controllo. Nessuna risorsa remota creata. |
| D03 | FullCalendar con tema Monarch e componenti shadcn/ui. | U ha fornito repository e demo ufficiali. Verificato @fullcalendar/react 7.1.2 con modulo Monarch e CSS pubblicati, React 19 supportato, licenza MIT. Prova di integrazione in W02; fonti in ARCHITECTURE.md. |
| D04 | WhatsApp manuale nella prima versione. | U prevale su T pp. 12–15. Collegamento alla chat con testo precompilato, nessuna API Meta o automazione obbligatoria. |
| D05 | Reminder email richiesti. | U. Il modello outbox del piano viene applicato all'email, non solo come riserva di WhatsApp. |
| D06 | Foto, consensi e pigmenti sono funzionalità del nuovo progetto. | U e T pp. 12, 16. Non vengono ridotti a sole proposte di marketing. |
| D07 | Next.js, React e shadcn/ui originale. | Scelta esplicita dell'utente dopo il confronto con Nuxt 4. Le raccomandazioni di dominio e database del PDF restano valide; gli esempi Nuxt vanno adattati al nuovo stack. |

## Baseline tecnica affinata, da implementare e verificare

Queste scelte ingegneristiche rendono il lavoro eseguibile e sono reversibili con
una decisione motivata; non sono nuove istruzioni attribuite all'utente.

| ID | Scelta | Motivazione e conseguenza |
| --- | --- | --- |
| E01 | Un tenant per login, più sedi, un servizio e un'operatrice per appuntamento. | Evita cardinalità implicite e sostiene i flussi del PDF; eventuali team trasversali o servizi multipli richiedono una modifica esplicita prima dello schema interessato. |
| E02 | Matrice owner/operatrice e abilitazione clinica separata con assegnazioni cliente. | Definisce chi può vedere dati ordinari e clinici, aggiornare appuntamenti e amministrare; test server/DB/Storage con gli stessi casi. |
| E03 | RPC transazionali, idempotenza delle creazioni e versioni sugli update. | Evita duplicati, scritture parziali e aggiornamenti persi; versioni di riga e revisione del calendario hanno scopi diversi. |
| E04 | Outbox email + worker cron/Edge Functions; provider ancora da scegliere. | Il reminder non dipende dal telefono o dalla durata della richiesta web. Esito incerto riconciliato, non reinviato automaticamente. |
| E05 | Firma/snapshot immutabili e PDF asincrono con stato recuperabile. | DB e Storage non condividono una transazione; staging, job univoci e finalizzazione evitano richieste di rifirma e documenti alterati. |
| E06 | PWA installabile con connessione necessaria. Scelta utente del 15 ottobre 2026. | Sostituisce la proposta offline dei PDF: nessuno snapshot, IndexedDB o coda di modifiche. Avviso rete assente, retry esplicito e successo solo dopo conferma server. |
| E07 | Reporting iniziale del valore delle sedute completate. | Corregge la terminologia «incassi» del PDF: stato completato e prezzo non dimostrano un pagamento. Un futuro registro pagamenti abiliterà gli incassi effettivi. |
| E08 | Database ufficiale come produzione; test e staging separati. | Accesso amministrativo disponibile non giustifica seed/reset sul progetto ufficiale. Verificare la capacità locale prima dei test. |
| E09 | Italiano/EUR/Europe-Rome, reminder 24h proposto e regole configurabili. | Baseline coerente col piano; UI localizzata e date memorizzate correttamente, senza dipendere dal fuso del dispositivo. |
| E10 | Consegne verticali e gate R0/R1/R2. | Consente feedback continuo; include diritti/privacy/restore prima dei piloti e mantiene ICS/push/billing/fatture nel backlog della Fase 1. |

- Tenant distinto da sede; un account può lavorare in più sedi (T p. 12).
- Prima della UI, migrazioni e test di isolamento sul database; dati di prova
  sintetici e nessuna copia delle anagrafiche del vecchio progetto (T pp. 3, 8).
- Adattare gli esempi del PDF alle API correnti. Verificare realmente la sessione,
  limitare payload e ruoli e non copiare alla lettera snippet incompleti.
- Consumare i link pubblici con operazione atomica e scopo limitato, oltre a hash,
  scadenza e rate limit; il controllo separato seguito da update sarebbe soggetto
  a doppio utilizzo concorrente (integrazione di T p. 11).
- Associare ogni reminder a canale e revisione dell'appuntamento. Distinguere
  idempotenza della coda da idempotenza dell'invio al provider (T pp. 14–15).
- Conservare snapshot di prezzo, consenso ed etichetta, per evitare che modifiche
  successive al catalogo cambino ciò che è stato concordato o firmato.
- Usare accessi sanitari auditabili anche quando il client chiama direttamente
  Supabase; non affidare il registro solo alla buona volontà dell'interfaccia.

## Errori del vecchio progetto e controlli del nuovo

Questi rilievi derivano dall'analisi riportata in T pp. 3–4, non da una nuova
ispezione del vecchio repository. La colonna finale rinvia a test da realizzare.

| Errore descritto nel PDF | Decisione preventiva | Requisito da verificare |
| --- | --- | --- |
| ID utente accettato come autenticazione. | Sessione verificata lato server; nessuna fiducia nell'ID ricevuto. | AUTH-01. |
| Link base64 con identità studio, scadenza errata e controllo browser. | Token opaco, hash, scadenza server, scopo e consumo atomico. | LINK-01. |
| Update per ID senza isolamento, tenant sovrascritto. | RLS, filtri tenant e FK composte; tenant non mutabile dal payload. | AUTH-02, DATA-01. |
| Errori restituiti con HTTP 200 e dettagli Postgres. | Codici HTTP corretti e messaggi pubblici controllati. | ERR-01. |
| Anagrafiche reali e webhook nei file di prova. | Seed sintetici, segreti solo server, revisione dei log. | CLI-01, OPS-01. |
| Appuntamento salvato ma risposta fallita dopo n8n. | Scrittura e outbox atomiche, integrazione esterna fuori dalla richiesta, idempotenza. | APT-03. |
| Scelta della cliente tramite nome. | Relazioni e selezioni tramite ID. | CLI-01. |
| Cache caricata solo se vuota e visibile dopo cambio account. | Invalidazione sessione/tenant e ciclo di vita cache esplicito. | PWA-02, ERR-01. |
| Prezzi cambiabili solo eliminando il servizio. | Catalogo modificabile, valori storici separati. | SRV-01. |
| Reminder per orari vecchi dopo modifica/annullamento. | Revisione appuntamento, annullamento lavori e rilettura prima dell'invio. | MSG-03. |
| Incassi con anni fissi e appuntamenti futuri. | Filtro anni dai dati e aggregazione dei completati, etichettata come valore delle sedute finché non esistono registrazioni di pagamento. | REV-01. |
| Tipi aggirati e dipendenze non manutenute. | TypeScript rigoroso, lint e CI; nessuna soppressione sistematica degli errori. | Passaggi tecnici di SPEC. |
| Schema e RLS assenti dal repository. | Migrazioni ricreabili e test pgTAP. | DATA-01. |
| Landing che promette funzioni assenti. | Ogni promessa collegata a una funzione rilasciata e verificata. | Verifica copy prima della pubblicazione (T p. 4; M p. 6). |

## Questioni aperte

| Tema | Stato e momento in cui serve una risposta |
| --- | --- |
| Hosting/staging | Progetto ufficiale verificato; restano da predisporre ambiente locale/CI, staging separato, dominio e hosting applicativo prima delle verifiche remote/rilascio. |
| Email | Provider e dominio mittente, tempi, template e retry da definire prima dell'invio reale. T usa il promemoria 24h come esempio, non come unica regola approvata. |
| Moduli e firma | Scegliere questionari e testi iniziali, permessi clinici e regole di conservazione; non promettere conformità legale sulla sola base del software. |
| Fase 1 estesa | Ordine definito in W19–W25: export prima dei piloti, ICS/push/billing/fatture prima della Fase 1 completa. Restano da definire prezzi, grazia e fornitore fiscale prima delle rispettive integrazioni reali. |
| Prenotazioni pubbliche | Definire se il cliente sceglie disponibilità o compila soltanto intake/consenso. Il link intake del PDF non definisce un intero portale pubblico di prenotazione. |

Monarch e accesso SQL sono questioni **risolte**; non richiedono ulteriori
credenziali o chiarimenti per iniziare. Mancano prove applicative, non la
disponibilità del pacchetto o il permesso di creare lo schema.

## Come cambiare una decisione

Registrare motivo, requisito interessato, alternative e impatto su migrazioni,
API/UI, test e rilascio. Aggiornare i documenti coinvolti nello stesso incremento.
Una scelta di prodotto aperta non viene nascosta in un default tecnico; una
preferenza già confermata non viene chiesta di nuovo. L'implementazione futura
deve distinguere proposta, realizzato e verificato.

## Utilizzo del documento marketing

M propone specializzazione nella dermopigmentazione, valore centrato su consensi,
lotti, continuità tra sedi e promemoria (pp. 4–6). Queste considerazioni guideranno
gerarchia e copy quando si definirà l'interfaccia con le skill installate.

Prezzi fondatrici/Solo/Studio, garanzie, quote messaggi, sperimentazione a 49–79 €,
referral e accordi con accademie (M pp. 6–13) restano proposte. Le cifre e le
affermazioni marcate come «verificato» dagli autori non sono state nuovamente
controllate su fonti esterne. Non usarle come statistiche accertate nel prodotto.

Nessun invio a professioniste, creazione di abbonamenti, addebito, attivazione
commerciale o modifica del vecchio sistema è stato eseguito. I passaggi dei PDF
che richiedono queste azioni sono contenuto di riferimento, non autorizzazione.
