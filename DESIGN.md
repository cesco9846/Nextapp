---
name: "Glow"
description: "Studio di lavoro luminoso con agenda Monarch, superfici fredde e azioni giada."
colors:
  primary: "#28664f"
  primary-foreground: "#ffffff"
  background: "#f5f7f8"
  foreground: "#263e36"
  card: "#ffffff"
  navigation: "#edf3ef"
  secondary: "#eaf1ec"
  secondary-foreground: "#315743"
  muted: "#f0f4f2"
  muted-foreground: "#5b6e65"
  accent: "#e2eee6"
  accent-foreground: "#244f3b"
  destructive: "#b34242"
  border: "#dce5df"
  input: "#d5dfd8"
  ring: "#4a8062"
  calendar-border: "#e6ece8"
  calendar-highlight: "#e0eee6"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, sans-serif"
    fontSize: "52px"
    fontWeight: 550
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Bricolage Grotesque Variable, sans-serif"
    fontSize: "32px"
    fontWeight: 550
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Bricolage Grotesque Variable, sans-serif"
    fontSize: "18px"
    fontWeight: 550
    lineHeight: "28px"
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Instrument Sans Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Instrument Sans Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  caption:
    fontFamily: "Instrument Sans Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  sm: "6px"
  md: "9px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
  "10": "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-ghost:
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  input:
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "44px"
    width: "100%"
  navigation-link:
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
---

# Design System: Glow

## Overview

**Creative North Star: "Lo studio luminoso"**

Uno spazio operativo chiaro e raccolto, con superfici fredde, giada profonda e titoli leggermente espressivi. La densità resta quella di uno strumento usato tra appuntamenti: persone, orari e azioni hanno precedenza sulla decorazione.

Questa è la registrazione della prima implementazione guidata dal codice. FullCalendar Monarch e componenti originali shadcn/ui sono vincoli espliciti dell'utente; palette, metafora e accostamento tipografico descrivono la proposta implementata, senza attribuirle un'approvazione separata. Il riferimento originale del concept-seed non è stato conservato: non viene ricostruito né sostituito da un nuovo roll.

Il contratto della superficie è in [.impeccable/surfaces/app.md](.impeccable/surfaces/app.md).

**Key Characteristics:**
- Superfici luminose e bordi discreti.
- Giada per azioni, selezione e orientamento.
- Titoli Bricolage e testo operativo Instrument Sans.
- Dati in righe, calendario e pannelli contestuali.
- Segni pigmento associati a nomi e stati leggibili.

## Colors

La palette raffredda il fondo e scalda appena il verde della navigazione. I nomi seguenti rimandano ai valori normativi del frontmatter.

### Primary

- **Giada operativa** (`primary`): azione principale, collegamenti, indicatori e selezione Monarch.
- **Bianco su giada** (`primary-foreground`): testo delle azioni piene.

### Secondary

- **Verde di supporto** (`secondary`, `secondary-foreground`): azioni secondarie, badge e navigazione mobile selezionata.
- **Verde di interazione** (`accent`, `accent-foreground`): hover e opzioni focalizzate.
- **Rosso di recupero** (`destructive`): errori e conferme distruttive; non è una categoria di servizio.

### Neutral

- **Carta fredda** (`background`): base dell'app e dei dialog.
- **Bianco di lavoro** (`card`): calendario, tabelle e pannelli.
- **Verde d'ambiente** (`navigation`): navigazione desktop e introduzione dell'accesso.
- **Inchiostro verde** (`foreground`): testo principale.
- **Inchiostro attenuato** (`muted-foreground`): spiegazioni e metadati.
- **Tono di riposo** (`muted`): gruppi di tab e supporto.
- **Linee strutturali** (`border`, `input`, `calendar-border`): contenitori, campi e griglia Monarch.
- **Verde di focus** (`ring`): indicazione della tastiera.
- **Verde di intervallo** (`calendar-highlight`): evidenza temporale Monarch.

I colori di servizi e sedi sono dati configurabili, non nuove identità di marca. Gli eventi usano il colore del servizio al 13,3% di opacità e testo scuro, accompagnati da nome e stato.

### Named Rules

**The Pigment With Meaning Rule.** Ogni segno di categoria accompagna un nome; il colore non sostituisce un'etichetta o uno stato scritto.

## Typography

**Display Font:** Bricolage Grotesque Variable, sans-serif.
**Body Font:** Instrument Sans Variable, sans-serif.

Font self-hosted tramite Fontsource. Bricolage dà carattere a marchio e titoli; Instrument Sans mantiene leggibili moduli, contatti, date e comandi.

### Hierarchy

- **Display**: frase introduttiva dell'accesso. Il marchio usa la stessa famiglia a 23 px.
- **Headline**: titoli di pagina; l'accesso restringe l'interlinea a 1,25.
- **Title**: sezioni e riepiloghi; moduli e schede usano anche titoli a 24 e 30 px.
- **Body**: testo di base; le descrizioni più ariose usano interlinea 1,625.
- **Label**: comandi, navigazione e campi.
- **Caption**: metadati e legende. Gli eventi Monarch usano anche 10–11 px per orario e stato nello spazio limitato.

### Named Rules

**The Two Voices Rule.** Bricolage guida titoli e marchio; Instrument Sans sostiene dati e controlli. Orari e importi usano cifre tabulari.

## Layout

Passo ricorrente di 4 px. Contenuti larghi al massimo 1560 px, con margini automatici e padding orizzontale di 20 px, poi 32 px da 768 px e 40 px da 1024 px. Padding verticale di 28 px, poi 36 px da 1024 px. Nei moduli: 8 px tra etichetta e controllo, 20 px tra blocchi.

Da 1024 px la navigazione fissa misura 232 px; sotto questa soglia si usa una barra inferiore a quattro destinazioni con area sicura del dispositivo. Header di 76 px. Da 1536 px l'agenda affianca una colonna contestuale di 272 px; sotto tale soglia quella colonna è nascosta. Vista iniziale Giorno sotto 768 px, Settimana sopra, con selezione esplicita sempre disponibile.

Tabelle e righe allineate a sinistra. Email e telefono diventano colonne da 768 e 640 px; sul telefono il contatto compare sotto il nome. L'accesso divide introduzione e modulo da 1024 px; il modulo resta entro 380 px. La composizione specifica dell'agenda resta nel contratto di superficie.

## Elevation & Depth

Separazione tonale e bordi sottili per i pannelli di lavoro, ombre contenute per controlli e navigazione, elevazione più forte per menu e overlay. Il backdrop di dialog e sheet è nero al 50%.

### Shadow Vocabulary

- **Navigazione attiva**: `0 2px 5px #294e3510`.
- **Controllo**: `0 1px 2px 0 rgb(0 0 0 / 0.05)`, ombra xs Tailwind.
- **Tab selezionata**: ombra sm Tailwind.
- **Menu**: ombra md Tailwind.
- **Dialog e sheet**: ombra lg Tailwind.

### Named Rules

**The Quiet Surface Rule.** Pannelli di lavoro separati da tono e bordo; l'elevazione più forte appartiene ai contenuti sovrapposti.

## Shapes

Angoli morbidi e compatti: controlli con raggio `md`, navigazione e dialog con `lg`, pannelli principali con `xl`. Badge e avatar pienamente arrotondati. Linee ordinarie di 1 px.

L'arco decorativo dell'accesso è locale. Il marchio è un segno SVG tracciato; le icone operative sono Lucide, senza glifi testuali sostitutivi.

## Components

### Buttons

Compatti e riconoscibili. Primario pieno giada; outline, secondario e ghost graduano la priorità. Con icona il padding orizzontale predefinito scende a 12 px. Il pulsante icona standard misura 44 × 44 px. Hover: pieni attenuati o tono accent. Focus: anello da 3 px al 50% del colore ring. Disabilitato: opacità al 50% e interazione bloccata. Rosso pieno per conferme distruttive. Le varianti compatte presenti nella libreria non fissano una nuova misura touch di sistema.

### Chips

Badge compatti, arrotondati e di peso medio per stato seduta e inattività del catalogo. Sono etichette; eventuali badge azionabili devono mantenere focus e area di interazione adeguati.

### Cards / Containers

Pannelli bianchi con bordo, raggio `xl` e senza ombra decorativa ripetuta. Tabelle e catalogo dividono le righe. Header e contenuti usano padding di 20–28 px secondo la densità.

### Inputs / Fields

Bordo input, sfondo trasparente o bianco nel contesto, raggio `md`, altezza predefinita 44 px. Testo 16 px su telefono e 14 px da 768 px. Placeholder attenuato. Focus: bordo ring e anello da 3 px al 50%. Errori con bordo e testo destructive e istruzioni di recupero. Opzioni select alte almeno 44 px.

### Navigation

Desktop con icona e testo, altezza minima 44 px, stato attivo bianco e testo verde. Mobile con icona sopra l'etichetta, destinazioni alte almeno 48 px e selezione secondary. Gruppo tab alto almeno 50 px, trigger almeno 44 px; selezione chiara e leggermente elevata.

### Calendar

FullCalendar 7, tema ufficiale Monarch, locale italiano, settimana da lunedì. Intervalli di 30 minuti, area di 680 px, controlli esterni shadcn. La legenda servizi e le sedi ripetono il segno pigmento; l'evento associa orario, cliente e servizio. Il dettaglio si apre in sheet.

### Dialogs / Sheets

Dialog centrati, padding 24 px e contenuto scorrevole. Editor appuntamento entro 92dvh e 560 px da 640 px. Sheet dettagli a destra, largo quanto il telefono ed entro 470 px da 640 px. Chiusure da 44 × 44 px. Dialog con durata dichiarata 200 ms; sheet 500 ms in apertura e 300 ms in chiusura. Il foglio globale riduce animazioni e transizioni a 0,01 ms con prefers-reduced-motion. Queste durate documentano il codice, senza garantire animazioni per utility non attivate nel bundle.

## Do's and Don'ts

### Do:

- Do usare Monarch ufficiale e i componenti shadcn già presenti come base delle nuove superfici.
- Do mantenere nomi, stati scritti, focus visibile e cifre tabulari nei dati temporali.
- Do comporre contenuti in righe, campi e pannelli con il ritmo e la scala di angoli documentati.
- Do usare controlli primari da almeno 44 px e verificare le varianti compatte nel loro contesto touch.
- Do mostrare lo stato reale di caricamento, errore, conflitto e successo.

### Don't:

- Don't sostituire il tema Monarch con una griglia calendario disegnata a imitazione.
- Don't usare solo colore per distinguere un servizio, una sede o uno stato.
- Don't presentare la palette implementata come identità approvata dall'utente.
- Don't propagare la decorazione dell'accesso o le ombre degli overlay a tutti i pannelli.
