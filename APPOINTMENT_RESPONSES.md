# Conferma e disdetta da link personale — W17

La cliente apre `/appuntamento#<token>` senza account. Vede soltanto studio,
data, orario e nome della sede. Non riceve nome cliente, servizio, contatti o
dati clinici. La pagina usa il sistema visivo Glow e componenti shadcn/ui.

## Comportamento

- Aprire pagina, anteprima email o link non modifica l’appuntamento. Il caricamento
  del riepilogo usa un POST di lettura, senza consumare una risposta.
- **Conferma appuntamento** registra `confirmed`. La cliente può successivamente
  disdire dallo stesso link, entro il termine dello studio.
- **Disdici appuntamento** apre una seconda scelta in linea. Solo **Conferma
  disdetta** registra `cancelled`, libera lo slot e aggiorna i reminder nella
  stessa transazione. Nessuna nuova prenotazione o modifica di orario dal link.
- Ogni azione ha una ricevuta durevole. Una conferma ripetuta restituisce la
  ricevuta esistente; il retry esatto di una disdetta restituisce la stessa
  ricevuta, anche dopo l’incremento di revisione causato dalla disdetta stessa.
  La disdetta è terminale: un link vecchio non può riconfermarla.
- Un cambio di data, durata, operatrice o sede cambia la revisione di agenda e
  rende inutilizzabile il link precedente. Anche scadenza, revoca, cliente
  archiviata o perdita dei permessi dell’emittente manuale impediscono l’uso.
- Se la risposta di rete si perde, la pagina blocca le altre azioni e riprova
  con la stessa azione/UUID. Offline i pulsanti sono disabilitati; nessuna coda
  o persistenza locale. Riaprire il link originale recupera lo stato dal server.

## Regola di disdetta

In **Il tuo studio → Promemoria email**, la titolare configura da 0 a 168 ore
di anticipo. Default tecnico **0**, quindi fino all’inizio dell’appuntamento,
senza attribuire allo studio una politica commerciale non ancora scelta.
Il termine è `starts_at - ore`: ore effettivamente trascorse, anche nei cambi
di ora legale. Mostrato nel fuso dello studio e verificato nuovamente sul server.
La modifica vale anche per link già inviati; il modulo lo dichiara. Dopo il
termine resta possibile confermare, ma per disdire/spostare si contatta lo studio.
La regola non impedisce le operazioni autorizzate della professionista sull’agenda.

## Condivisione e storico

Nel dettaglio appuntamento, titolare e operatrice assegnata possono creare,
copiare e revocare un link o aprire WhatsApp con il testo da inviare manualmente.
Un nuovo link manuale revoca i precedenti manuali; i link email rimangono separati.
Il token manuale viene mostrato una sola volta. Se la creazione è riuscita ma
la risposta si è persa, il retry restituisce metadati senza token e l’interfaccia
propone di crearne uno nuovo. Chiudendo il pannello non viene conservata una
copia recuperabile del token manuale.

I nuovi snapshot Resend v2 includono automaticamente il link. È creato nella
stessa transazione del primo dispatch e inserito nel testo privato congelato:
retry, chiave idempotente, mittente e destinatario restano identici. Nessuno
snapshot storico viene riscritto e nessuna vecchia email viene reinviata.
V1 e provider di test continuano il percorso precedente. Questo incremento non
crea invii immediati aggiuntivi e non modifica l’attivazione dei reminder.

Le risposte sono visibili nel dettaglio appuntamento con data/ora; aggiornamento
esplicito dei metadati e refresh dell’agenda ogni 30 secondi. Le notifiche push
alla professionista sono W22; gli alert email tecnici restano in attesa della
casella dedicata. Un’email già affidata al provider non può essere richiamata:
la cancellazione ne conserva l’esito incerto quando necessario, come W15/W16.

## Confini tecnici

Migrazione forward **25**. Tre tabelle private/RLS, nessun grant ordinario:
`appointment_action_links`, `appointment_responses`, `appointment_response_limits`.
Token casuali di 256 bit, hash SHA-256 univoco, scadenza al più presto tra
inizio appuntamento e 30 giorni dall’emissione. Il token di un’email deve
necessariamente esistere anche nel relativo snapshot privato congelato; non
compare nelle risposte professionali di listing né nei log applicativi.

RPC professionali: `manage_appointment_action_links` e
`appointment_response_preferences`. Il gateway service-only
`use_appointment_action_link` accetta solo hash, azione e UUID della richiesta;
non accetta tenant, cliente, nuovo stato arbitrario o dati appuntamento.
Lock ordinati studio → appuntamento → link, condivisi con modifica, dispatch,
revoca e preferenze. Vincoli unici impediscono eventi duplicati.

API pubbliche POST `/api/appointment-response/read` e `/submit`, senza cookie
professionali, con controllo Origin, schema rigoroso e risposte `no-store`.
GET/HEAD non eseguono azioni. Credenziali service solo server, target Supabase
ufficiale o loopback locale verificato, timeout RPC 10 secondi. Token nel
frammento URL rimosso prima della lettura; no-referrer/noindex e nessun cache
offline. Limiti persistenti 300 accessi/minuto globali e 20 per token; bucket
eliminati dopo un’ora. Limite di emissione manuale: 60 link/ora per studio,
conteggiando anche i link email già creati. L’emissione automatica del reminder
segue i limiti del worker e non viene fermata da questo limite manuale.
Link, ricevute e audit crescono con azioni effettive; conservazione dei contenuti
e richieste privacy restano W19. I controlli a vuoto dello scheduler non creano
link, eventi o nuovi snapshot.

Nessuna modifica al piano Supabase, ai cron attivi, al mittente, alle chiavi
o al canale di allarme. Nessuna fixture o prova di invio nel database ufficiale.

## Verifica

501 pgTAP/12 file (44 controlli W17), 42 unit e 16 E2E pertinenti passati,
inclusi 7 W17 e 9 regressioni reminder/Resend. Build produzione, lint e
typecheck verificati. Lettura senza consumo, retry dopo risposta persa,
concorrenza con spostamento, cambio regola dopo apertura, isolamento, revoca e
offline coperti. Il focus dopo commit segue titolo di revisione, ritorno al
pulsante, ricevuta ed esito incerto, con asserzioni da tastiera.

Nove catture reali a 375/820/1280 px, detector una volta senza rilievi,
review Impeccable e documentazione completate. La review ha richiesto una
correzione di focus, poi valutata `ship`; sistema visivo conservato.
Non sono prove su telefoni fisici né un collaudo di consegna email a clienti.
