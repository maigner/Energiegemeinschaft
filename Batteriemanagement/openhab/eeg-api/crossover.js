// 1. HTTP-Request mit actions.HTTP
var url = "https://ischlstrom.org/api/eeginfo/crossover/v1";
var response = actions.HTTP.sendHttpGetRequest(url, 5000);

// 2. Antwort verarbeiten
if (response !== null) {
  try {
    var jsonData = JSON.parse(response);

    // Die API liefert 404 mit einem error-Feld, wenn die Kalenderwoche keine
    // Crossover-Zeiten hat (Winter: die Gemeinschaft kommt nie ins Plus).
    // Dann duerfen nicht die Werte der letzten Woche mit Daten weiterleben:
    // beide Items auf '-', die Steuerung entlaedt ohne plausible
    // Crossover-Zeiten nicht (core.js). Antwortet der Server gar nicht oder
    // unlesbar, bleiben die Werte stehen; core.js verwirft sie ueber
    // Ischlstrom_Crossover_Zeit nach 14 Tagen von selbst.
    if (!jsonData.crossover) {
      if (typeof jsonData.error === "string") {
        console.log("[IBM] Keine Crossover-Zeiten fuer die aktuelle Kalenderwoche (" + jsonData.error + ") - Wochen-Crossover geloescht");
        items.getItem("Ischlstrom_Crossover_Start").postUpdate("-");
        items.getItem("Ischlstrom_Crossover_Ende").postUpdate("-");
        try {
          items.getItem("Ischlstrom_Crossover_Zeit").postUpdate(time.ZonedDateTime.now().toString());
        } catch (e1) {
          // Item fehlt bei aelteren Installationen
        }
      } else {
        console.error("[IBM] Fehler: Antwort ohne Crossover-Daten - Items bleiben unveraendert.");
      }
    } else {
      var start = jsonData.crossover.avg_morning_crossover;
      var ende = jsonData.crossover.avg_evening_crossover;

      // 3. Werte in die String-Items schreiben, Abrufzeit fuer die
      //    Alterspruefung der Steuerung mitschreiben
      items.getItem("Ischlstrom_Crossover_Start").postUpdate(start);
      items.getItem("Ischlstrom_Crossover_Ende").postUpdate(ende);
      try {
        items.getItem("Ischlstrom_Crossover_Zeit").postUpdate(time.ZonedDateTime.now().toString());
      } catch (e2) {
        // Item fehlt bei aelteren Installationen - Setup-Skript 03 erneut ausfuehren
      }
      console.log("[IBM] Crossover aktualisiert (KW " + jsonData.crossover.week_number + "): " + start + " - " + ende);
    }
  } catch (e) {
    console.error("[IBM] Fehler beim Parsen der Antwort: " + e.message);
  }
} else {
  console.error("[IBM] Fehler: Keine Antwort von der API erhalten.");
}
