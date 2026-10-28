# Compilazione cliente — W12

Mode: Operate. Narrow extension of Glow's clinical preparation and existing
single-column access/form patterns. Inherit PRODUCT.md and DESIGN.md; no identity
change, seed, comp or decorative asset. User asked to continue the scheduled W12.

## Direction contract

THESIS: la cliente legge il testo e completa le domande del proprio trattamento,
poi riceve una conferma chiara senza entrare nello studio digitale.
OWN-WORLD: existing cool ground, white working surfaces, jade primary actions,
Bricolage headings and Instrument Sans body; original shadcn/ui controls.
STORY: professionista salva la preparazione, crea un link o passa il tablet;
cliente legge, compila e invia; lo studio riprende con un nuovo accesso.
FIRST VIEWPORT: compact Glow header, appointment context, clear unsigned status
and readable document; isolated column with questions below. Professional panel
follows the saved-preparation action, separating link generation from tablet handoff.
FORM: existing form composition, full-width phone controls, restrained separators,
no sidebar or patient list on public/tablet page; one explicit submit, success
receipt or recoverable error. 44px touch targets, no persistent answers or queued
saves. Tablet exit requires professional login; never a cosmetic PIN gate.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Evidenza del 15 ottobre 2026

Prima ispezione: otto catture valide, tre viewport (375/820/1280), incluse due
catture di componente per il pannello professionale e una viewport con dialogo.
Reviewer `fix`: avviso di sostituzione link da rendere visibile prima dell’azione;
recupero di un avvio tablet ambiguo da portare all’accesso.

Un solo batch ha spostato l’avviso prima dei pulsanti e aggiunto recupero con
svuotamento della cache e navigazione completa al login. Conferma sulle stesse
otto catture più recovery-tablet.png, che mostra l’accesso dopo una risposta
incompleta reale del server di prova. Il test verifica anche API protette 401.
Verdetto finale `ship` sui due rilievi valutati, nessuna regressione materiale.
Nessun ulteriore ciclo grafico dopo la conferma.

Detector eseguito una sola volta: zero primari, advisory preesistente sulla label
mobile AppShell da 11 px, non modificata/canonizzata. Nessun nuovo raster;
provenienza delle tre icone pubbliche verificata. Token nelle catture soltanto
capability locali sintetiche; immagini e trace ignorati da Git. Suite: 225 pgTAP,
31 E2E e 10 unit superati. I test/capture usano esclusivamente Supabase locale.

Documenter: confronto di DESIGN.md/sidecar, PRODUCT, globals, entrambi i moduli
intake e primitive shadcn. Nessuna modifica necessaria al sistema. Snippet focus
del sidecar e advisory 11 px preesistenti lasciati fuori dalla canonizzazione.

## Estensione del 28 ottobre 2026 — raccolta dei pacchetti

Ordinary extension in modalità Operate del modulo isolato: intestazione con
studio, cliente, firmatario/ruolo e appuntamento con anno, ora e fuso forniti dal
server. L’informativa e la scelta esplicita sui dati sanitari precedono le
risposte; un rifiuto arresta la raccolta senza dichiarare annullata la seduta.
Con due rappresentanti entrambi scelgono prima della compilazione del primo;
gli altri attendono e aggiornano lo stato con un comando esplicito. Le domande
Sì/No non hanno risposte preselezionate. Rete necessaria, nessuna persistenza
clinica nel browser o coda automatica; invii ambigui conservano in memoria lo
stesso tentativo per il recupero.

La colonna entro 768 px, i testi Instrument Sans, i titoli Bricolage e i pulsanti
giada/outline originali shadcn proseguono il sistema vigente. Le catture health
e questionnaire a 375/820/1280 px appartengono alle 27 evidenze finali descritte
in clinical.md: review equivalente di sostituzione `packages_verdict_reviewer`,
`ship` solo sul rilievo temporale corretto. Il documenter fresco equivalente ha
confrontato client-packet/packet-document, globals e primitive con PRODUCT,
DESIGN e sidecar, con campione diretto health-375. Nessun cambio di sistema o
nuovo raster pubblico; drift incumbent lasciato inalterato come in clinical.md.
