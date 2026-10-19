# App studio

Mode: Operate. Scope: /app, accesso e configurazione iniziale.
Build: code-led; nessuna comp approvata. Monarch ufficiale e shadcn/ui sono
vincoli espliciti dell'utente; la palette è una proposta dell'implementazione.

## Direction contract

THESIS: l'agenda di lavoro è il centro del prodotto; navigazione e dettaglio
aiutano a prenotare e ritrovare una persona senza attraversare un cruscotto.

OWN-WORLD: fondo freddo #f5f7f8, superfici bianche, navigazione #edf3ef,
azioni giada #28664f, testo #263e36. Instrument Sans e Bricolage Grotesque.

STORY: accedi, configura studio/sede/servizio, registra una cliente, prenota
e modifica una seduta; apri WhatsApp con un messaggio da inviare manualmente.

FIRST VIEWPORT: desktop con navigazione 232px, calendario Monarch fluido e
pannello giornata da 1536px. Telefono con agenda giorno e navigazione inferiore.
La prenotazione è l'azione principale sopra l'agenda.

FORM: interfaccia operativa con componenti originali shadcn/ui e Monarch.
Il roll di direzione è stato eseguito ma il riferimento `seed:` originale non
è stato conservato nella continuità della sessione. Non si afferma che il tool
lo avesse dichiarato indisponibile; non si inventa un hash e non si esegue un
nuovo roll. La scelta applicata segue i vincoli espliciti dell'utente.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Evidenze

Prima revisione: direzione visiva confermata; richieste area tocco 44px e
provenienza del contratto. Detector eseguito una volta su src: nessun rilievo.
Screenshot desktop/telefono e moduli in `.impeccable/review` (ignorati da Git).
Verdetto finale sulle due correzioni richieste: `ship`, entrambe risolte.
Chiusura, opzione select, tab e link contatto misurati nel browser ad almeno
44px. Sistema documentato in DESIGN.md e `.impeccable/design.json` (schema 2).
Tre icone PNG con origine SVG incorporata; scansione senza provenienze mancanti.

### Registrazione: errori password (16 ottobre 2026)

Estensione della superficie esistente: registrazione e recupero applicano il
minimo già previsto di 10 caratteri, contando i punti di codice; il campo errato
mantiene valore e focus e collega istruzione e messaggio tramite ARIA. Gli errori
password restituiti da Auth hanno indicazioni operative senza esporre il testo
grezzo del provider. L'accesso con password esistenti mantiene il comportamento
precedente. Sei scenari Playwright mirati superati, incluso il ciclo reale locale
registrazione, conferma email e recupero; evidenza in
`.cache/logs/signup-e2e.log`.

Finish review: `ship`, senza correzioni materiali. Ispezionate le sei catture
degli stati password corta e debole a 375, 820 e 1280 px in
`.impeccable/review/signup/`; detector eseguito una volta, zero rilievi in
`.cache/logs/signup-design-detect.json`. Nessun nuovo asset pubblico, token,
regola CSS o cambio di direzione: DESIGN.md e `.impeccable/design.json`
conservati invariati dopo confronto con foglio globale e componenti effettivi.

### W16.b: preferenze ed esiti promemoria (19 ottobre 2026)

Estensione App in modalità Operate, guidata dal codice. La titolare accede da
“Il tuo studio” a `/app/promemoria`; navigazione e breadcrumb mantengono quel
contesto. Preferenza dello studio e disponibilità del servizio sono distinte:
il salvataggio non attiva gli invii del servizio e non recupera appuntamenti
preesistenti. Mittente e Reply-To confermato sono informazioni di sola lettura.

Lo storico presenta fino a 25 righe per pagina, filtri “Tutti” e “Da verificare”,
aggiornamento esplicito e paginazione keyset per orario previsto e ID. Nome
cliente, date tabulari e stato scritto precedono la spiegazione operativa;
il nome apre la scheda cliente esistente. “Accettata per l’invio” non equivale
a consegna; “Esito da verificare” richiede assistenza prima di altri invii.
La schermata non offre reinvio. Caricamento, vuoto, errore e salvataggio hanno
messaggi espliciti; offline i comandi di salvataggio e aggiornamento sono
disabilitati e le modifiche non vengono accodate per un invio successivo.
Non viene introdotta persistenza offline dei dati.

Confronto con l’incumbent: fondo freddo, pannelli bianchi bordati, giada,
Bricolage/Instrument Sans, controlli shadcn da 44 px e stato espresso anche in
testo rimangono quelli di DESIGN.md. Preferenze su due colonne da 1024 px,
impilate sotto tale soglia; storico in righe, senza nuove card decorative.
Controllati `src/app/globals.css`, i componenti Button/Checkbox e gli artefatti
`src/features/reminders/{reminder-settings.tsx,message-status.ts,types.ts}`,
`src/app/app/{promemoria,impostazioni}/page.tsx` e
`src/components/app-shell.tsx`, rispetto a PRODUCT.md, DESIGN.md e
`.impeccable/design.json`. Nessun nuovo token o cambio di sistema: DESIGN.md
e sidecar conservati invariati.

Finish review: `ship`, senza correzioni materiali; sette catture valide in
`.impeccable/review/reminders/`: stati `empty` e `history` a 375, 820 e 1280 px,
più `save-error-375.png`. Verifica documentale con campione visivo diretto
`empty-375.png`, `history-1280.png` e `save-error-375.png`. Detector eseguito
una volta, registrato in `.cache/logs/reminders-design-detect.json`: unico
advisory sugli 11 px della navigazione mobile preesistente, non canonizzato
né corretto nell’estensione. Sette E2E mirati superati in
`.cache/logs/reminders-e2e-final.log`, inclusi accesso titolare, isolamento,
paginazione e distinzione degli esiti; build presente nello stesso log.
Nessun nuovo raster pubblico da corredare di provenienza.
