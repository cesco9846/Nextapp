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
