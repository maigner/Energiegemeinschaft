// Berechnet die Netzeinspeisung aus der Batterie fuer die Overview-Seite:
// Die Batterie entlaedt (+) und das Netz nimmt auf (Netzleistung negativ) -
// der kleinere der beiden Werte fliesst tatsaechlich von der Batterie ins
// Netz, der Rest der Entladung versorgt den Haushalt. Dieselbe Rechnung
// macht das Vorstands-Dashboard aus den gepushten Rohwerten.
//
// Vorzeichen wie beim Fronius geliefert: Batterie + = entladen, Netz + =
// Bezug, - = Einspeisung. Ein Profil, das andere Vorzeichen liefert, muss
// sie in seinen Items auf diese Konvention bringen.
//
// Die @...@-Platzhalter ersetzt 04-install-rules.sh; die Regel wird nur
// installiert, wenn beide Quell-Items konfiguriert sind.

function powerOf(name) {
  try {
    var state = String(items.getItem(name).state);
    if (state === 'NULL' || state === 'UNDEF') return null;
    var value = parseFloat(state);
    return isNaN(value) ? null : value;
  } catch (e) {
    return null;
  }
}

var battery = powerOf('@IBM_BATTERY_POWER_ITEM@');
var grid = powerOf('@IBM_GRID_POWER_ITEM@');

var target;
try {
  target = items.getItem('IBM_BATTERIE_NETZEINSPEISUNG');
} catch (e) {
  console.error('[IBM][Netzeinspeisung] Item IBM_BATTERIE_NETZEINSPEISUNG fehlt - Setup-Skript 03 erneut ausfuehren.');
  target = null;
}

if (target !== null) {
  if (battery === null || grid === null) {
    // Quellwert fehlt: Anzeige zuruecksetzen statt einen alten Wert zu zeigen.
    if (String(target.state) !== 'UNDEF') target.postUpdate('UNDEF');
  } else {
    var feedInW = Math.round(Math.min(Math.max(battery, 0), Math.max(-grid, 0)));
    if (parseFloat(target.numericState) !== feedInW) target.postUpdate(feedInW);
  }
}
