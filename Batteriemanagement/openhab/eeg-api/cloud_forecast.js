// 1. HTTP-Request mit actions.HTTP
var url = "https://ischlstrom.org/api/wolken/vorschau/v1";
var response = actions.HTTP.sendHttpGetRequest(url, 5000);

// 2. Antwort verarbeiten
if (response !== null) {
  try {
    var jsonData = JSON.parse(response);

    // die API liefert 404 mit einem error-Feld, wenn keine Wetterdaten vorliegen
    if (!jsonData.wolken || typeof jsonData.wolken.vorschau !== "number") {
      console.error("[IBM] Fehler: Keine Wolkenvorschau von der API erhalten" + (jsonData.error ? " (" + jsonData.error + ")" : "") + " - Item bleibt unveraendert.");
    } else {
      var value = jsonData.wolken.vorschau;

      if (value < 0 || value > 100) {
        console.error("[IBM] Fehler: Wolkenvorschau ausserhalb 0-100 (" + value + ") - Item bleibt unveraendert.");
      } else {
        // 3. Wert in das Number-Item schreiben, Abrufzeit fuer die
        //    Aktualitaetspruefung der Steuerung mitschreiben
        items.getItem("Ischlstrom_Wolkenvorschau").postUpdate(value);
        try {
          items.getItem("Ischlstrom_Wolkenvorschau_Zeit").postUpdate(time.ZonedDateTime.now().toString());
        } catch (e2) {
          // Item fehlt bei aelteren Installationen - Steuerung laeuft dann ohne Aktualitaetspruefung
        }

        // 4. Stundenwerte fuer den Rest des heutigen Tages (dynamische
        //    Laderegelung). Datum und Abrufzeit wandern mit ins JSON - die
        //    Steuerung verwirft veraltete oder fremde Tage selbst. '-' wenn
        //    der Server (noch) keine Stundenwerte liefert.
        var stundenText = "-";
        if (Array.isArray(jsonData.wolken.stunden) && jsonData.wolken.stunden.length > 0
            && typeof jsonData.wolken.datum === "string") {
          stundenText = JSON.stringify({
            datum: jsonData.wolken.datum,
            zeit: time.ZonedDateTime.now().toString(),
            stunden: jsonData.wolken.stunden
          });
        }
        try {
          items.getItem("Ischlstrom_Wolken_Stunden").postUpdate(stundenText);
        } catch (e3) {
          // Item fehlt bei aelteren Installationen - Setup-Skript 03 erneut ausfuehren
        }
        console.log("[IBM] Wolkenvorschau aktualisiert: " + value
          + (stundenText === "-" ? "" : " (+" + jsonData.wolken.stunden.length + " Stundenwerte)"));
      }
    }
  } catch (e) {
    console.error("[IBM] Fehler beim Parsen der Antwort: " + e.message);
  }
} else {
  console.error("[IBM] Fehler: Keine Antwort von der API erhalten.");
}
