# Risposta all’appuntamento — W17

Mode: Operate. Estensione guidata dal codice dei flussi cliente e agenda
esistenti, con scopo preciso richiesto dall’utente. Nessun nuovo sistema visivo
o roll di direzione; ereditare PRODUCT.md, DESIGN.md e la superficie App.

## Direction contract

THESIS: leggere quando e dove si svolge la seduta e registrare una risposta
consapevole. Apertura e anteprima non modificano l’appuntamento.

OWN-WORLD: fondo freddo #f5f7f8, pannello bianco, testo #263e36, azioni giada
#28664f, bordi #dce5df e rosso #b34242 per confermare una disdetta.
Bricolage nei titoli e Instrument Sans per dati e controlli shadcn da 44 px.

STORY: link personale senza account; riepilogo minimo, conferma, eventuale
disdetta entro il termine, esito registrato e recupero esplicito se la rete cade.

FIRST VIEWPORT: marchio, titolo di stato e studio, poi tre righe per data,
orario e sede; regola di disdetta accanto alle azioni. Colonna raccolta da
telefono a desktop. La disdetta apre una seconda scelta esplicita in linea.

FORM: prosecuzione delle superfici cliente/agenda già realizzate, senza un
nuovo seed. Interazione caratteristica: dopo la conferma il riepilogo rimane
visibile e la disdetta resta disponibile entro la regola dello studio.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Documentazione ed evidenze — 20 ottobre 2026

Estensione del sistema Glow esistente: colonna cliente entro 672 px, riepilogo
bianco bordato con raggio xl, azioni impilate sotto 640 px e affiancate sopra.
Conferma e disdetta mostrano uno stato scritto; la disdetta richiede una seconda
scelta in linea. Il focus passa al titolo di esito, alla domanda di disdetta o
al recupero della stessa richiesta; “Mantieni appuntamento” lo restituisce al
comando di disdetta. Regola dello studio e gestione link restano nei pannelli
Promemoria e dettaglio appuntamento, con controlli shadcn da 44 px.

Confrontati PRODUCT.md, DESIGN.md, `.impeccable/design.json` e la superficie App
con `src/app/globals.css`, Button/Input/Badge e gli artefatti finali
`src/features/agenda/{client-appointment-response,appointment-response-panel,appointment-details}.tsx`,
`src/features/reminders/{response-policy,reminder-settings}.tsx` e
`src/app/appuntamento/page.tsx`. Palette fredda e giada, Bricolage/Instrument
Sans, bordi e gerarchia delle azioni riusano l’incumbent: nessun nuovo token o
cambio normativo. DESIGN.md e sidecar conservati invariati.

Finish review: `ship` dopo la correzione del flusso focus richiesta nella prima
revisione, senza ulteriori correzioni. Nove catture valide in
`.impeccable/review/appointment-response/`: `open-375`, `open-1280`,
`confirmed-375`, `cancel-review-375`, `cancelled-1280`, `uncertain-375`,
`unavailable-375`, `policy-820`, `agenda-panel-1280` (PNG). Campione visivo
documentale diretto: apertura mobile, revisione disdetta, regola a 820 px e
pannello agenda desktop. Detector eseguito una volta: `[]` in
`.cache/logs/action-links-design-detect.json`. Verificati i log
`action-links-focus-e2e.log` (16 scenari superati, inclusi focus e tastiera),
`action-links-db-final.log` (501 verifiche) e `action-links-unit.log` (42 test),
oltre a build produzione e typecheck finali. Nessun nuovo raster pubblico.

Drift preesistente: navigazione mobile a 11 px in `src/components/app-shell.tsx`,
già annotata nella superficie App; non canonizzata né corretta in questa
estensione. Nessuna nuova regola di sistema introdotta per legittimarla.
