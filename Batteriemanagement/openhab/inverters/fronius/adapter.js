// ============================================================================
// IBM - Wechselrichter-Adapter: Fronius GEN24 (Fronius-Binding)
//
// Definiert die drei Funktionen des Adapter-Kontrakts (siehe control/core.js)
// ueber die Batterie-Thing-Actions des openHAB-Fronius-Bindings. Die Actions
// legen selbst ablaufende Schedules an - nach `minutes` Minuten kehrt der
// Wechselrichter von allein zum Werksverhalten zurueck, auch wenn openHAB
// ausfaellt.
//
// KEIN ibmLimitCharge: das Fronius-Binding bietet keine Action, die die
// Ladeleistung auf einen Wert begrenzt (nur Sperren, forciertes Laden und
// forciertes Entladen). Die Laderegelung des Kerns bildet die Begrenzung
// deshalb per PWM ueber ibmPreventCharge nach - an der Schreibfrequenz
// aendert das nichts (auch bisher wurde im Fenster alle 5 Minuten ein
// Schedule gesetzt).
//
// Voraussetzung: Benutzername und Passwort des Wechselrichters im Bridge-
// Thing, sonst stellt das Binding die Batterie-Actions nicht bereit.
//
// Vom Setup ersetzt: @IBM_THING_UID@ (Thing-UID des Wechselrichters).
// ============================================================================

var __ibmFroniusActions = null;
try {
  __ibmFroniusActions = actions.thingActions('fronius', '@IBM_THING_UID@');
} catch (e) {
  __ibmFroniusActions = null;
}
if (__ibmFroniusActions === null || __ibmFroniusActions === undefined) {
  console.log('[IBM][Adapter] Fronius-Actions nicht verfuegbar - Credentials im Bridge-Thing pruefen');
}

// Die Actions liefern je nach Binding-Version boolean oder String.
function __ibmOk(value) {
  return value === true || String(value) === 'true';
}

function ibmReset() {
  if (__ibmFroniusActions === null) return { ok: false };
  try {
    return { ok: __ibmOk(__ibmFroniusActions.resetBatteryControl()) };
  } catch (e) {
    console.log('[IBM][Adapter] resetBatteryControl fehlgeschlagen: ' + e);
    return { ok: false };
  }
}

function ibmPreventCharge(minutes) {
  if (__ibmFroniusActions === null) return { ok: false };
  try {
    var from = time.ZonedDateTime.now();
    var until = from.plusMinutes(minutes);
    return { ok: __ibmOk(__ibmFroniusActions.addPreventBatteryChargingSchedule(from, until)) };
  } catch (e) {
    console.log('[IBM][Adapter] addPreventBatteryChargingSchedule fehlgeschlagen: ' + e);
    return { ok: false };
  }
}

function ibmForceDischarge(watts, minutes) {
  if (__ibmFroniusActions === null) return { ok: false };
  try {
    var from = time.ZonedDateTime.now();
    var until = from.plusMinutes(minutes);
    var ok = __ibmOk(__ibmFroniusActions.addForcedBatteryDischargingSchedule(from, until, Quantity(watts + 'W')));
    return { ok: ok, appliedW: watts };
  } catch (e) {
    console.log('[IBM][Adapter] addForcedBatteryDischargingSchedule fehlgeschlagen: ' + e);
    return { ok: false };
  }
}
