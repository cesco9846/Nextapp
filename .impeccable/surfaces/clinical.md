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
