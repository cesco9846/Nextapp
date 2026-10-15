# Compilazione cliente e passaggio tablet — W12

Estensione della preparazione non firmata W11. Non acquisisce una firma né un
consenso sanitario definitivo; firma/snapshot/PDF restano W13. Resend è scelto,
ma questo incremento non invia email e non modifica DNS.

## Contratto

- La professionista con accesso clinico alla cliente salva la preparazione,
  poi genera un link personale (24 ore, massimo fino alla fine appuntamento)
  oppure avvia la modalità tablet (30 minuti, stessa scadenza massima).
- Un nuovo link dello stesso tipo revoca il precedente. Revoca manuale,
  sospensione/revoca dell’assegnazione dell’autrice, archivio cliente, cambio
  della preparazione o revisione/stato appuntamento invalidano il collegamento.
- Token casuale server da 256 bit, persistito solo come hash nello schema
  privato. URL `/compila#<token>`: il frammento non arriva nei log HTTP, viene
  rimosso dalla barra dopo apertura e resta soltanto in memoria. La pagina e
  le API sono no-store, senza referrer né strumenti di tracciamento.
- GET/HEAD caricano solo la pagina. Il POST di apertura restituisce testi e
  domande delle versioni fissate, nome studio, primo nome cliente e contesto
  appuntamento. Non mostra risposte precedenti, altre clienti, file o etichette.
- POST esplicito di invio verifica tipi/domande/risposte richieste, registra
  le risposte private e consuma il link nella stessa transazione. Due invii
  distinti producono un solo risultato. Il retry con identica chiave e payload
  restituisce solo la ricevuta, senza leggere risposte. Altre aperture dopo uso
  o scadenza/revoca restituiscono 410. Nessun salvataggio alla riconnessione.

## Confini tecnici

`intake_links` contiene solo metadati RLS. Hash token, ricevute idempotenti e
contatori sono nello schema privato, senza grant anon/authenticated. Emissione
e revoca usano la sessione; accesso pubblico passa attraverso un modulo
server-only limitato a una RPC con capability. Nessuna query generica privilegiata
nel form pubblico. Ogni apertura riuscita è auditata prima della risposta.

Il gateway conserva i tentativi anche quando rifiuta token o risposte, tornando
un risultato tipizzato anziché annullare la transazione. Limiti persistenti:
300 richieste/minuto globali e 20 per token/minuto; le finestre oltre un’ora
sono rimosse. Sono limiti iniziali tecnici, da affiancare ai limiti HTTP
dell’hosting prima del pilota. Non si presume affidabile un IP da header client.
Ordine lock: contatore globale → tenant → appuntamento → link/preparazione.
Il controllo clinico viene ripetuto dopo il lock, come in W11.

## Tablet

L’avvio esplicito disconnette la sessione professionale locale sul server e
apre un documento completo senza shell dello studio. Tornare a pagine protette
richiede un nuovo accesso della professionista, anche digitando l’URL. Il ripristino
di pagine autenticate dalla cronologia nasconde il documento e richiede reload;
non si usa un PIN visivo come autorizzazione. Il tablet condiviso resta soggetto
alle funzioni del sistema operativo: questo non è un kiosk gestito del dispositivo.
Se la risposta di avvio si perde dopo il logout, si torna all’accesso e si genera
un nuovo collegamento. Mai mantenere l’agenda accessibile per recuperare un token.

## Verifica prevista

pgTAP per RLS/grant, scopo e versioni, audit, validazione completa, consumo/rollback
e limiti persistenti; browser con sessioni vere per due invii concorrenti,
esito perso e retry, revoca/scadenza, rete assente senza coda, tablet disconnesso
e cronologia/URL protetti. Catture con testi e persone sintetici a 375/820/1280 px.
