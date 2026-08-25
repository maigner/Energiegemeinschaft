// Holt das Ladesperre-Fenster aus der Tagesprognose von ischlstrom.org:
// vom ersten Sonnenschein bis in die Mittagsspitze des Ueberschusses.
//
// Zwei Wege:
//  * Mit Status-Token (Normalfall): POST an die individualisierte API.
//    Der Server berechnet das Ende je Anlage aus dem Erzeugungsprofil des
//    Prognosetags und den zuletzt gepushten Schaetzwerten der Anlage
//    (Batteriekapazitaet, Ladeleistung) - so spaet, dass die Batterie am
//    Abend voll wird. Die Antwort meldet individuell=true; die Steuerung
//    (control/core.js) uebernimmt das Ende dann unveraendert und laesst
//    ihre eigene Flatrate-Rechnung aus.
//  * Ohne Token oder mit IBM_LADESPERRE_LOKAL=OFF (das Mitglied will kein
//    angepasstes Ende): GET auf die oeffentliche Community-API wie frueher;
//    bei OFF unterbleibt auch die lokale Rechnung der Steuerung.
//
// An Tagen ohne erwarteten Ueberschuss (oder wenn die Anlage laut Profil
// den ganzen Tag zum Laden braucht) liefert die API start/ende als null -
// dann wird '-' in die Items geschrieben und die Steuerung sperrt nicht.
// Das Datum-Item begrenzt die Gueltigkeit: die Steuerung ignoriert Fenster,
// deren Datum nicht der heutige Tag ist (z. B. nach einem API-Ausfall).
var token = '@IBM_STATUS_TOKEN@';
var individualisierenGewuenscht = true;
try {
  if (String(items.getItem("IBM_LADESPERRE_LOKAL").state) === "OFF") {
    individualisierenGewuenscht = false;
  }
} catch (e) {
  // Item fehlt (aelterer Stand): Vorgabe bleibt individualisieren.
}
var response;
if (token.length > 0 && individualisierenGewuenscht) {
  var url = "https://ischlstrom.org/api/ibm/ladefenster/v1";
  response = actions.HTTP.sendHttpPostRequest(url, "application/json", JSON.stringify({ token: token }), 5000);
} else {
  response = actions.HTTP.sendHttpGetRequest("https://ischlstrom.org/api/eeginfo/ladefenster/v1", 5000);
}

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
      var individuell = fenster.individuell === true;

      // Entladestart der Nacht: erster Slot, in dem die Gemeinschaft laut
      // Prognose deutlich im Defizit ist. '-' heisst kein Wert (die
      // Steuerung startet dann beim Abend-Crossover plus Abstand).
      var entladestart = (typeof fenster.entladestart === "string" && /^\d{2}:\d{2}$/.test(fenster.entladestart)) ? fenster.entladestart : "-";

      items.getItem("Ischlstrom_Ladesperre_Start").postUpdate(start);
      items.getItem("Ischlstrom_Ladesperre_Ende").postUpdate(ende);
      items.getItem("Ischlstrom_Ladesperre_Datum").postUpdate(String(fenster.datum));
      // Kennzeichnung fuer die Steuerung; eigenes try, damit eine
      // Installation ohne das Item die Fenster-Items trotzdem bekommt.
      try {
        items.getItem("Ischlstrom_Ladesperre_Individuell").postUpdate(individuell ? "ON" : "OFF");
      } catch (e) {
        console.error("[IBM] Item Ischlstrom_Ladesperre_Individuell fehlt - Setup-Skript 03 erneut ausfuehren.");
      }
      try {
        items.getItem("Ischlstrom_Entladestart").postUpdate(entladestart);
      } catch (e3) {
        console.error("[IBM] Item Ischlstrom_Entladestart fehlt - Setup-Skript 03 erneut ausfuehren.");
      }

      // Stuendliche Ladefaktoren des Erzeugungsprofils samt Abend-Deadline:
      // die Laderegelung integriert daraus die effektive Restladezeit.
      // Datum und Abrufzeit wandern mit ins JSON - die Steuerung verwirft
      // veraltete oder fremde Tage selbst. '-' ohne Faktoren (aelterer
      // Server, kein Prognoseprofil).
      var lf = fenster.ladefaktoren;
      var faktorenText = "-";
      if (lf && Array.isArray(lf.stunden) && lf.stunden.length > 0 && typeof lf.deadline === "string") {
        faktorenText = JSON.stringify({
          datum: String(fenster.datum),
          zeit: time.ZonedDateTime.now().toString(),
          deadline: lf.deadline,
          stunden: lf.stunden
        });
      }
      try {
        items.getItem("Ischlstrom_Ladefaktoren").postUpdate(faktorenText);
      } catch (e2) {
        // Item fehlt bei aelteren Installationen - Setup-Skript 03 erneut ausfuehren
      }
      console.log("[IBM] Ladesperre-Fenster aktualisiert (" + fenster.datum + "): " + start + " - " + ende + (individuell ? " (individuell)" : "") + (entladestart !== "-" ? " | Entladung ab " + entladestart : "") + (faktorenText === "-" ? "" : " | " + lf.stunden.length + " Ladefaktoren bis " + lf.deadline));
    }
  } catch (e) {
    console.error("[IBM] Fehler beim Parsen der Antwort: " + e.message);
  }
} else {
  console.error("[IBM] Fehler: Keine Antwort von der API erhalten.");
}
