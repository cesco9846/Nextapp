# Gestione team e accesso

Mode: Operate. Extension of the existing Glow application; inherit DESIGN.md.
Targets: /app/team, /invito, /accesso-sospeso, installazione e avviso rete.
No new visual identity, concept roll or comp: existing components and palette.

## Direction contract

THESIS: la titolare gestisce l’ingresso e la sospensione delle persone con
azioni esplicite; ogni accesso è legato a un’identità verificata.

OWN-WORLD: ereditare #f5f7f8, bianco, giada #28664f, navigazione #edf3ef,
Instrument Sans e Bricolage Grotesque. Componenti originali shadcn/ui.

STORY: crea un invito per un’email, condividi il link, accedi e accettalo;
assegna le clienti, abilita i dossier e sospendi o riattiva un’operatrice.

FIRST VIEWPORT: lista membri dominante, invito a destra su desktop ampio e
in sequenza su telefono; stato e revoca degli inviti sotto la lista.

FORM: estensione precisa del sistema esistente, senza un nuovo esercizio di
identità. Righe, controlli da 44px, conferma della sospensione, campi etichettati
e nessun invio email dichiarato. PWA installabile e sempre connessa: nessuna coda
di modifiche o consultazione offline. Il banner segnala dati potenzialmente vecchi.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Evidence

112 controlli pgTAP e 14 scenari browser su build di produzione, dati locali
sintetici. Conferma e recupero email con SMTP locale; install prompt sintetico
nel solo test, installazione nativa su dispositivi fisici ancora da verificare.
Detector sui componenti modificati eseguito una volta: nessun rilievo.

## Checkpoint di sviluppo

La prima revisione ha richiesto navigazione attiva per Team e rimozione
dell’introduzione duplicata nel login incorporato dell’invito. Entrambe le
correzioni sono state confermate nelle cinque catture aggiornate: verdetto
`ship` del 15 ottobre 2026, nessuna regressione osservata. Il documenter ha
confrontato sorgenti e sistema visivo: nessuna modifica necessaria a DESIGN.md
o al sidecar. La deriva preesistente degli snippet focus nel sidecar rimane
segnalata, senza introdurre nuovi token per questa estensione.
