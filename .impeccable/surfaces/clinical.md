# Consensi, pigmenti e preparazione

Mode: Operate. Ordinary extension of Glow; inherit DESIGN.md and PRODUCT.md.
Targets: /app/documenti and /app/appuntamenti/:id/preparazione.
No new identity, seed, comp or decorative imagery. Original shadcn/ui throughout.

THESIS: prepara un trattamento sapendo quali testi e lotti saranno usati,
senza perdere lo storico quando il catalogo cambia.
OWN-WORLD: existing jade actions, cool ground, white panels, Instrument Sans
body and Bricolage headings. Rows, clear labels, 44px controls.
STORY: pubblica un modello, registra pigmento e lotto con etichetta privata,
apri l’appuntamento, scegli le versioni e salva una preparazione non firmata.
FIRST VIEWPORT: document catalog tabs and real rows; preparation shows the
appointment context and explicit draft status before document/lot selection.
FORM: existing shell, four mobile nav items. Catalog under Il tuo studio;
preparation under Agenda. Dense lists, generous section separation, no metric
cards or claims that a draft is signed. Owner edits catalog; clinical staff
read it, assigned clinicians work on client preparations. Failure preserves
in-memory input; explicit saves only, no offline queue.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Evidenza del 15 ottobre 2026

Prima revisione: otto catture valide, disposizione `fix` per la seconda riga
di schede mobili coperta dalla ricerca. Un solo batch ha riservato 94 px al
gruppo su telefono (due righe da 44 px più padding), mantenendo 50 px su desktop.
Le stesse otto catture sono state rigenerate e aperte; il reviewer ha confermato
il difetto risolto, nessuna regressione materiale: disposizione finale `ship`,
relativa alla correzione valutata. Nessun nuovo ciclo grafico dopo la conferma.

Test UI a 375 px: misura atomica dei rettangoli, altezza dei trigger, ricerca
separata e selezione di tutte le schede; percorso pubblicazione/upload/bozza
superato. Suite completa: 24 E2E, 176 pgTAP e 10 unit. Detector una sola volta:
zero rilievi primari; advisory preesistente `text-[11px]` nella navigazione mobile
non modificato né canonizzato. Provenienza raster: scan di public, tre icone,
zero file mancanti. L’etichetta dimostrativa è una fixture locale, non un asset
distribuito. Catture/test restano ignorati da Git.

Il documenter ha confrontato DESIGN.md, sidecar, PRODUCT.md, globals, cinque
componenti clinici e primitive shadcn: nessun cambiamento del sistema, nessuna
modifica ai due file di design. Deriva preesistente degli snippet focus nel
sidecar e label mobili da 11 px segnalate, senza ripararle o trasformarle in regole.

## Estensione del 19 ottobre 2026 — foto lotto facoltativa

Richiesta utente: salvare un lotto anche senza foto dell’etichetta. Ordinary
extension in modalità Operate: il campo dichiara «Foto dell’etichetta
(facoltativa)» e l’aiuto spiega che si può salvare senza foto, mantenendo formati,
limite e riservatezza dell’eventuale allegato. In preparazione, il ramo privo di
foto mostra «Foto dell’etichetta non allegata.» senza comando per aprirla.
Una correzione locale assegna allo stato assente una riga intera nel contenitore
flex; non introduce una nuova regola di layout del sistema.

Evidenze finali sintetiche locali, rigenerate dopo la correzione e validate:
[nuovo lotto 375](../review/optional-lot/new-lot-375.png),
[820](../review/optional-lot/new-lot-820.png),
[1280](../review/optional-lot/new-lot-1280.png) e
[preparazione 375](../review/optional-lot/preparation-375.png).
Le tre catture di firma sono registrate nel contratto signature.md. Il finish
reviewer `optional_lot_finish_reviewer` ha dato disposizione `ship` sullo stato
finale in tutte e cinque le sezioni, senza correzioni materiali richieste.
Detector eseguito una sola volta: `.cache/logs/optional-lot-detect.json` contiene
`[]`. Verifica funzionale: 15 E2E clinici/documenti/nuovo lotto superati;
ulteriori nove test nuovo lotto/runner/worker superati.

L’assenza viene conservata con ID e hash null espliciti; aggiungere una foto al
catalogo successivamente non modifica lo snapshot già conservato. Gli allegati
esistenti mantengono le verifiche previste. Documenter: confronto di PRODUCT.md,
DESIGN.md, sidecar, globals, tre componenti modificati e primitive shadcn;
palette, font, controlli e regole incumbent confermati. DESIGN.md e design.json
rimangono invariati. Nessun nuovo raster pubblico: le catture documentano prove
con dati sintetici locali. Deriva preesistente del focus negli snippet sidecar e
label mobili da 11 px non riparata né canonizzata, fuori dal perimetro richiesto.

## Estensione del 28 ottobre 2026 — pacchetti predefiniti

Ordinary extension in modalità Operate: basi native Microblading/Lip Blush,
profilo professionale, bozze persistite e pubblicazioni per servizio. Il confronto
con una nuova base precede l’adozione esplicita; aggiornare la bozza non riscrive
lo storico pubblicato. Preparazione con identità verificata, uno o due
rappresentanti verificati e link personali. Restano originali i controlli shadcn,
le righe separate e le sezioni ariose; nessun nuovo mondo, comp, seed o asset.
Direzione e comportamento approvati in DEFAULT_CONSENT_PLAN.md e DEFAULT_CONSENTS.md.

Evidenza comune alle estensioni clinical/intake/signature: inventario
`../review/packages/captures.json`, 21 full-page e sei crop supplementari delle
conferme a 375/820/1280 px, tutti rigenerati dopo la correzione; nessun overflow
nelle misure full-page. Prima review completa delle 27 catture: unico rilievo
sull’identità temporale dell’appuntamento. Il nuovo reviewer equivalente
`packages_verdict_reviewer`, in sostituzione del reviewer iniziale, ha ispezionato
tutte le 27 catture finali: rilievo `RESOLVED`, nessuna regressione introdotta osservata,
disposizione `ship` limitata alla correzione valutata. La sostituzione non è una
nuova review completa con ampliamento del perimetro. Detector già eseguito una
sola volta: `.cache/logs/defaults-design-detect.json` contiene `[]`; non rieseguito.
Verifiche locali: 683 pgTAP in 16 file, 56 unit e 48 E2E (14 specifici e 34
regressioni); lint, typecheck, build di produzione e idempotenza migrazione
superati. Sono prove sintetiche locali, non verifica fisica o revisione legale.

Documenter fresco equivalente, eseguito come ruolo separato perché il harness
non espone un selettore specializzato: confronto di PRODUCT.md, DESIGN.md,
sidecar, globals, Button/Input/Checkbox e dei cinque moduli
`src/features/packages/{package-library,packet-preparation,client-packet,packet-document,packet-label}.tsx`.
Campione visivo diretto: library-1280, health-375 e counter-confirmation-820.
Confermati fondo freddo, giada, Bricolage/Instrument Sans, titoli pagina da 32 px,
controlli da 44 px e colonne staff/client entro 1024/768 px. Nessun nuovo token o
cambio di sistema: PRODUCT.md, DESIGN.md e design.json conservati invariati.
Focus degli snippet sidecar, label mobili da 11 px, buildPath non impostato e
provenienza storica incompleta del seed restano preesistenti, non riparati né
canonizzati. Nessun nuovo raster pubblico; catture e firme sono prove sintetiche.
