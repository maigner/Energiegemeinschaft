// 1. HTTP-Request mit actions.HTTP
var url = "https://ischlstrom.org/api/wolken/vorschau/v1";
var response = actions.HTTP.sendHttpGetRequest(url, 5000);

// 2. Antwort verarbeiten
if (response !== null) {
  try {
    var jsonData = JSON.parse(response);
    var value = jsonData.wolken.vorschau;

    // 3. Wert in das Number-Item schreiben
    items.getItem("Ischlstrom_Wolkenvorschau").postUpdate(value);
    console.log("[IBM] Wolkenvorschau aktualisiert: " + value);
  } catch (e) {
    console.error("[IBM] Fehler beim Parsen der Antwort: " + e.message);
  }
} else {
  console.error("[IBM] Fehler: Keine Antwort von der API erhalten.");
}