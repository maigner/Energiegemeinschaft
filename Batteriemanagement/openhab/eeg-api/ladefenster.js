// Holt das Ladesperre-Fenster aus der Tagesprognose von ischlstrom.org:
// vom ersten Sonnenschein bis zum prognostizierten Vormittags-Crossover
// (ab dann erzeugt die Gemeinschaft mehr, als sie verbraucht, und die
// Batterie darf wieder aus der eigenen PV laden - geladen wird immer nur
// aus der eigenen PV-Anlage, nie aus dem Netz).
//
// An Tagen ohne erwarteten Ueberschuss liefert die API start/ende als null -
// dann wird '-' in die Items geschrieben und die Steuerung sperrt nicht.
// Das Datum-Item begrenzt die Gueltigkeit: die Steuerung ignoriert Fenster,
// deren Datum nicht der heutige Tag ist (z. B. nach einem API-Ausfall).
var url = "https://ischlstrom.org/api/eeginfo/ladefenster/v1";
var response = actions.HTTP.sendHttpGetRequest(url, 5000);

if (response !== null) {
  try {
    var jsonData = JSON.parse(response);

    // die API liefert 404 mit einem error-Feld, wenn keine Prognose vorliegt
    if (!jsonData.ladefenster || !jsonData.ladefenster.datum) {
      console.error("[IBM] Fehler: Kein Ladefenster von der API erhalten" + (jsonData.error ? " (" + jsonData.error + ")" : "") + " - Items bleiben unveraendert.");
    } else {
      var fenster = jsonData.ladefenster;
      var start = (fenster.start === null || fenster.start === undefined) ? "-" : String(fenster.start);
      var ende = (fenster.ende === null || fenster.ende === undefined) ? "-" : String(fenster.ende);

      items.getItem("Ischlstrom_Ladesperre_Start").postUpdate(start);
      items.getItem("Ischlstrom_Ladesperre_Ende").postUpdate(ende);
      items.getItem("Ischlstrom_Ladesperre_Datum").postUpdate(String(fenster.datum));
      console.log("[IBM] Ladesperre-Fenster aktualisiert (" + fenster.datum + "): " + start + " - " + ende);
    }
  } catch (e) {
    console.error("[IBM] Fehler beim Parsen der Antwort: " + e.message);
  }
} else {
  console.error("[IBM] Fehler: Keine Antwort von der API erhalten.");
}
