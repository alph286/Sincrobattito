# Sincrobattito — La Valvola Pulsante

Mini webapp locale per la scena della valvola a tre punti di pressione: i giocatori
si dividono nella stanza, non possono vedersi né parlarsi, e devono sentire il
battito condiviso e premere in sincronia sul cellulare per far cedere la valvola.

## Avvio

```bash
npm install
npm start
```

Il server stampa in console due indirizzi (usa l'IP locale del PC, es. `192.168.x.x`):

- **Regia (DM)**: `http://<ip>:3001/host` — apri questo sul tuo cellulare o laptop.
  Mostra la valvola pulsante e i controlli (BPM, battiti richiesti, tolleranza, finte).
- **Giocatori**: `http://<ip>:3001/play` — manda questo link ai giocatori (es. via
  Telegram): ognuno lo apre sul proprio cellulare, inserisce il nome e preme Accedi.

Assicurati che i cellulari dei giocatori siano sulla **stessa rete Wi-Fi** del PC
che fa da server.

## Come funziona

1. I giocatori entrano da `/play` col loro cellulare: appare un grande cerchio
   "organico" in attesa.
2. Il DM preme **Avvia la valvola** in regia: da quel momento la valvola batte
   a un ritmo fisso (i BPM impostati) e **quasi ogni battito** il cerchio di
   tutti i cellulari si accende di rosso (con vibrazione) — bisogna toccarlo
   subito, in tempo, insieme a tutti gli altri.
3. Di tanto in tanto (percentuale "Finte" configurabile) un battito è una
   **finta**: il cerchio diventa viola — quella volta **nessuno** deve
   toccarlo. Richiede attenzione oltre che riflessi.
4. Se anche solo un giocatore sbaglia (non tocca in tempo su un battito buono,
   oppure tocca su una finta), non succede nulla di grave: il tentativo si
   resetta e si riparte dal battito successivo, senza penalità.
5. Dopo il numero di battiti corretti consecutivi configurato (default 8), la
   valvola cede e parte l'animazione di successo su tutti gli schermi.

## Personalizzazione

Nei controlli della regia puoi regolare prima di avviare:

- **BPM**: velocità del battito condiviso (di base 66, più lento = più teatrale
  ma anche più lungo da giocare; più veloce = più frenetico).
- **Battiti richiesti**: quanti battiti corretti di fila servono per aprire la
  valvola.
- **Tolleranza (ms)**: quanto dura la finestra di reazione ad ogni battito —
  abbassala per richiedere riflessi più rapidi e precisi, alzala per renderla
  più permissiva (utile con connessioni lente o giocatori meno pratici col
  telefono). Viene comunque sempre limitata a un'quota dell'intervallo tra un
  battito e l'altro, così il tocco resta sempre "a tempo".
- **Finte (%)**: quanto spesso un battito è una finta da non toccare (0 = mai,
  solo battiti da premere; valori più alti aumentano la tensione e la
  necessità di attenzione oltre che di ritmo).

Il DM può anche premere **Reset tentativo** in qualsiasi momento per azzerare il
progresso senza far uscire i giocatori, o **Reset totale** per svuotare anche la
lista dei giocatori connessi (es. a fine sessione).
