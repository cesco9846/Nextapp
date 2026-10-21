# Studio, clienti e servizi — modifiche ed eliminazioni protette

Richiesta del 21 ottobre 2026. Funzioni riservate alla titolare, verificate
anche in RPC/database: nessuna eliminazione diretta dalle tabelle per utenti
ordinari, nessuna cancellazione a cascata dei contenuti di trattamento.

| Operazione                 | Regola                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nome studio                | Modificabile nelle impostazioni, 2–100 caratteri, controllo versione e audit. Aggiorna l’interfaccia; snapshot e PDF già firmati restano identici.                                                                                                                     |
| Elimina servizio           | Solo se nessun appuntamento di qualsiasi stato lo riferisce e nessun modello clinico, anche disattivato, lo usa. Altrimenti disattivarlo per le nuove prenotazioni.                                                                                                    |
| Elimina cliente            | Solo anagrafica senza appuntamenti, dossier, foto/file o richieste privacy da conservare. Anche appuntamenti annullati e passati impediscono la cancellazione.                                                                                                         |
| Export cliente             | Una copia ancora presente o non ripulita blocca l’eliminazione. Dopo scadenza/revoca e pulizia si può eliminare l’anagrafica; restano i soli metadati tecnici senza riferimento alla cliente fino alla retention ordinaria, per rintracciare eventuali upload tardivi. |
| Assegnazioni senza storico | Rimosse con l’anagrafica; l’audit conserva identificatori e azione, senza nomi/contatti copiati.                                                                                                                                                                       |

Conferma esplicita nel dialogo; per la cliente si digita `ELIMINA`. Errori,
offline e conflitti non chiudono il flusso come riuscito. La verifica preventiva
mostra motivi e alternative; la cancellazione ripete tutti i controlli sotto
lock, con verifica della versione. I vincoli FK rimangono l’ultima difesa contro
nuove associazioni concorrenti. Nessuna rimozione di file Storage da questo flusso.

Questo è un intervento operativo su anagrafiche inutilizzate, distinto dalle
richieste di cancellazione W19 e dalla procedura di distruzione dei dossier
clinici, che richiede basi/tempi approvati. Nessuna anagrafica o servizio dello
studio ufficiale viene eliminato per collaudare le nuove funzioni.

I metadati tecnici delle copie di una cliente eliminata sono esclusi dagli
elenchi applicativi e conservati dal worker fino alla retention ordinaria.

Implementazione: migrazione 028; API con sessione, origine, input e permessi;
estensioni shadcn delle impostazioni, scheda cliente e modifica servizio.
Verifica con pgTAP, browser locali, concorrenza reale e review visiva a
375/820/1280 px prima del checkpoint e della pubblicazione.
