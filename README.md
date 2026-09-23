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

- **Regia (DM)**: `http://<ip>:3000/host` — apri questo sullo schermo/laptop del DM.
  Mostra un QR code per far entrare i giocatori, la lista dei collegati e i controlli
  (BPM, numero di sincronie richieste, durata della finestra di pressione).
- **Giocatori**: `http://<ip>:3000/play` — ogni giocatore lo apre sul proprio
  cellulare (inquadrando il QR mostrato in regia), inserisce il nome ed entra.

Assicurati che i cellulari dei giocatori siano sulla **stessa rete Wi-Fi** del PC
che fa da server.

## Come funziona

1. I giocatori entrano da `/play` col loro cellulare: appare un grande cerchio
   "organico" che pulsa a ritmo condiviso (il battito della valvola).
2. Il DM preme **Avvia la valvola** in regia: da quel momento, a intervalli
   casuali, il cerchio di tutti i cellulari lampeggia con la scritta **PREMI!**
   (accompagnato da una vibrazione, se il telefono la supporta).
3. Per contare come "sincronia riuscita" **tutti** i giocatori collegati devono
   toccare il cerchio entro la finestra di tempo di quell'impulso.
4. Se anche solo uno manca il colpo, non succede nulla di grave: il tentativo si
   resetta e si ricomincia dal battito successivo.
5. Dopo il numero di sincronie configurato (default 3, come i tre punti di
   pressione della scena), la valvola cede e parte l'animazione di successo su
   tutti gli schermi.

## Personalizzazione

Nei controlli della regia puoi regolare prima di avviare:

- **BPM**: velocità del battito condiviso (di base 54, più lento = più teatrale).
- **Sincronie richieste**: quante pressioni sincronizzate di fila servono per
  aprire la valvola.
- **Finestra (ms)**: quanto dura la finestra di pressione ad ogni impulso —
  abbassala per rendere la sincronia più difficile, alzala per renderla più
  permissiva (utile con connessioni lente o giocatori meno pratici col telefono).

Il DM può anche premere **Reset tentativo** in qualsiasi momento per azzerare il
progresso senza far uscire i giocatori, o **Reset totale** per svuotare anche la
lista dei giocatori connessi (es. a fine sessione).
