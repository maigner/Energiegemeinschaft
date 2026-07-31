// Sammelt den Zustand der Anlage und meldet ihn an das Vorstands-Dashboard
// auf ischlstrom.org (/board/openhab). Authentifiziert wird mit dem
// Status-Token, das der Vorstand dort je Mitglied erzeugt und das bei der
// Einrichtung in der ibm.conf hinterlegt wurde.
//
// Die @...@-Platzhalter ersetzt 04-install-rules.sh anlagenspezifisch.

var url = "https://ischlstrom.org/api/ibm/status/v1";

// Itemzustand als String; null bei fehlendem Item oder NULL/UNDEF.
function stateOf(name) {
  try {
    var item = items.getItem(name);
    var state = String(item.state);
    return (state === "NULL" || state === "UNDEF") ? null : state;
  } catch (e) {
    return null;
  }
}

// Itemzustand als Zahl; Einheiten wie "78.5 %" werden mitgelesen.
function numberOf(name) {
  var state = stateOf(name);
  if (state === null) return null;
  var n = parseFloat(state);
  return isNaN(n) ? null : n;
}

var inverterStatus = null;
try {
  var thing = things.getThing('@IBM_THING_UID@');
  if (thing !== null && thing !== undefined) {
    inverterStatus = String(thing.status);
  }
} catch (e) {
  inverterStatus = null;
}

var payload = {
  anlage: '@IBM_ANLAGE_NAME@',
  token: '@IBM_STATUS_TOKEN@',
  data: {
    inverter_type: '@IBM_INVERTER_TYPE@',
    inverter_status: inverterStatus,
    soc: numberOf('@IBM_SOC_ITEM@'),
    hauptschalter: stateOf('Schalte_ISCHLSTROM_Empfehlung_einaus'),
    ladesperre_aktiv: stateOf('IBM_LADESPERRE_AKTIV'),
    entladung_aktiv: stateOf('IBM_ENTLADUNG_AKTIV'),
    dynamische_leistung: stateOf('IBM_DYNAMISCHE_LEISTUNG'),
    pause_tage: numberOf('IBM_PAUSE_TAGE'),
    batterie_kapazitaet: numberOf('IBM_BATTERIE_KAPAZITAET'),
    min_battery_charge: numberOf('IBM_MIN_BATTERY_CHARGE'),
    min_entladeleistung_w: numberOf('Minimale_Entladeleistung_Batterieeinspeisung'),
    max_entladeleistung_w: numberOf('Maximale_Entladeleistung_Batterieeinspeisung'),
    wolken_schwelle: numberOf('IBM_LADESPERRE_WOLKEN_SCHWELLE'),
    wolkenvorschau: numberOf('Ischlstrom_Wolkenvorschau'),
    wolkenvorschau_zeit: stateOf('Ischlstrom_Wolkenvorschau_Zeit'),
    crossover_start: stateOf('Ischlstrom_Crossover_Start'),
    crossover_ende: stateOf('Ischlstrom_Crossover_Ende'),
    ladesperre_start: stateOf('Ischlstrom_Ladesperre_Start'),
    ladesperre_ende: stateOf('Ischlstrom_Ladesperre_Ende'),
    ladesperre_datum: stateOf('Ischlstrom_Ladesperre_Datum')
  }
};

var response = actions.HTTP.sendHttpPostRequest(url, "application/json", JSON.stringify(payload), 15000);

if (response === null) {
  console.error("[IBM][Status] Keine Antwort von der API erhalten.");
} else {
  try {
    var jsonData = JSON.parse(response);
    if (jsonData.ok) {
      console.log("[IBM][Status] Status gemeldet (Ladestand: " + payload.data.soc + ").");
    } else {
      console.error("[IBM][Status] API-Fehler: " + (jsonData.error || response));
    }
  } catch (e) {
    console.error("[IBM][Status] Unerwartete Antwort: " + response);
  }
}
