// 1. HTTP-Request mit actions.HTTP
var url = "https://ischlstrom.org/api/eeginfo/crossover/v1";
var response = actions.HTTP.sendHttpGetRequest(url, 5000);

// 2. Antwort verarbeiten
if (response !== null) {
  try {
    var jsonData = JSON.parse(response);

    // die API liefert 404 mit einem error-Feld, solange die KW keine Daten hat
    if (!jsonData.crossover) {
      console.error("[IBM] Fehler: Keine Crossover-Daten fuer die aktuelle Kalenderwoche.");
    } else {
      var start = jsonData.crossover.avg_morning_crossover;
      var ende = jsonData.crossover.avg_evening_crossover;

      // 3. Werte in die String-Items schreiben
      items.getItem("Ischlstrom_Crossover_Start").postUpdate(start);
      items.getItem("Ischlstrom_Crossover_Ende").postUpdate(ende);
      console.log("[IBM] Crossover aktualisiert (KW " + jsonData.crossover.week_number + "): " + start + " - " + ende);
    }
  } catch (e) {
    console.error("[IBM] Fehler beim Parsen der Antwort: " + e.message);
  }
} else {
  console.error("[IBM] Fehler: Keine Antwort von der API erhalten.");
}
