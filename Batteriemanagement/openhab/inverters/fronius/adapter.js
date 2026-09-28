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
// Optional ibmBatteryMaintenance(): liest Battery_Mode aus der Solar API
// des Wechselrichters (ohne Anmeldung) und meldet Kalibrier-, Service- und
// Schutzladungen, waehrend der der GEN24 die Schedules ignoriert.
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

// --- Batteriewartung (optional, nur lesend) ---------------------------------
// Battery_Mode aus GetPowerFlowRealtimeData (Solar API V1, ohne Anmeldung)
// am Host der Fronius-Bridge - den haelt der Watchdog aktuell. Werte laut
// Fronius: normal, disabled, service, charge boost, nearly depleted,
// suspended, calibrate, grid support, deplete recovery, non operable
// (voltage/temperature), preheating, startup. Als Wartung zaehlen nur die
// Zustaende, in denen der Wechselrichter die Batterie selbst fuehrt.
var __IBM_BATTERY_MODE_WARTUNG = {
  'calibrate': 'Kalibrierung',
  'service': 'Serviceladung',
  'charge boost': 'Schutzladung',
  'deplete recovery': 'Schutzladung'
};

// Basis-URL der Solar API: Host (und Schema) der Fronius-Bridge, sonst null.
function __ibmSolarApiBase() {
  try {
    var all = things.getThings();
    for (var i = 0; i < all.length; i++) {
      var raw = all[i].rawThing;
      if (String(raw.getThingTypeUID()) !== 'fronius:bridge') continue;
      var cfg = raw.getConfiguration();
      var host = cfg.get('hostname');
      if (host === null || host === undefined || String(host).trim() === '') continue;
      var scheme = cfg.get('scheme');
      return ((scheme === null || scheme === undefined) ? 'http' : String(scheme)) + '://' + String(host).trim();
    }
  } catch (e) {
    console.log('[IBM][Adapter] Fronius-Bridge nicht lesbar: ' + e);
  }
  return null;
}

// Battery_Mode des ersten Wechselrichters mit Batterie als Wartung - oder null.
function __ibmSolarApiMaintenance() {
  var base = __ibmSolarApiBase();
  if (base === null) return null;
  try {
    var raw = actions.HTTP.sendHttpGetRequest(base + '/solar_api/v1/GetPowerFlowRealtimeData.fcgi', 5000);
    if (raw === null || raw === undefined) return null;
    var inverters = JSON.parse(String(raw)).Body.Data.Inverters;
    for (var key in inverters) {
      var mode = inverters[key] ? inverters[key].Battery_Mode : null;
      if (typeof mode !== 'string') continue;
      var modus = __IBM_BATTERY_MODE_WARTUNG[mode.toLowerCase()];
      if (modus) return { modus: modus, quelle: 'Battery_Mode ' + mode };
    }
  } catch (e) {
    console.log('[IBM][Adapter] Solar API (Battery_Mode) nicht lesbar: ' + e);
  }
  return null;
}

function ibmBatteryMaintenance() {
  return __ibmSolarApiMaintenance();
}
