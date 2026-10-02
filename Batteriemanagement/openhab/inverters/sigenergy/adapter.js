// ============================================================================
// IBM - Wechselrichter-Adapter: Sigenergy SigenStor (Modbus)
//
// Definiert die drei Funktionen des Adapter-Kontrakts (siehe control/core.js)
// ueber den Remote-EMS-Modus des Sigenergy-Modbus-Protokolls (Anlagenebene,
// Slave 247, proprietaere Registerkarte - kein SunSpec). Die Register haengen
// als Items an den Data-Things des Setups (inverter_things_json im Profil):
//
//   IBM_SG_EmsMode         EMS work mode (30003, 7 = Remote EMS aktiv)
//   IBM_SG_MaxActiveW      Anlagenmaximum in W (30010)
//   IBM_SG_RatedDischargeW Nennentladeleistung in W (30070)
//   IBM_SG_RemoteEnable    Remote EMS an/aus (40029)
//   IBM_SG_RemoteMode      Remote-EMS-Modus (40031, Appendix 6)
//   IBM_SG_DischargeLimitW Entladelimit in W (40034, wirkt bei Modus 5/6)
//   IBM_SG_PvLimitW        PV-Limit in W (40036, wirkt bei Modus 3-6!)
//
// Steuerlogik:
//   - Ladesperre:          Modus 5 (Entladung, PV zuerst) + Entladelimit 0.
//                          Die Batterie laedt nicht (Entlademodus) und
//                          entlaedt nicht (Limit 0); PV versorgt Haushalt
//                          und Netz normal weiter.
//   - forcierte Entladung: Modus 6 (Entladung, Batterie zuerst) + Limit in
//                          Watt. Sigenergy nimmt Watt direkt - anders als
//                          SunSpec-Prozente ist appliedW hier exakt.
//   - Ruecksetzen:         Remote EMS aus (40029 = 0), die Anlage kehrt in
//                          ihren konfigurierten EMS-Modus zurueck.
//
// Das PV-Limit (40036) wirkt in ALLEN Kommando-Modi. Damit ein dort
// stehender Altwert die PV-Erzeugung nicht abwuergt, wird es vor jedem
// Steuerbefehl auf das Anlagenmaximum (30010) gesetzt.
//
// BEWUSST KEIN ibmLimitCharge: eine echte Ladeleistungs-Begrenzung ginge
// nur ueber die Command-Charging-Modi des Remote EMS - die koennen die
// Batterie aber auch aus dem NETZ laden, wenn die PV das Kommando nicht
// deckt. Das verletzt den IBM-Grundsatz "geladen wird nur aus PV";
// ausserdem ist das Ladelimit-Register im Spike noch nicht verifiziert.
// Die Laderegelung des Kerns nutzt deshalb die PWM ueber ibmPreventCharge
// (Modus 5 laedt nie aus dem Netz).
//
// Fail-Safe: Sigenergy kennt (Stand Protokoll V1.7) KEIN geraeteseitiges
// Auto-Revert wie das SunSpec-InOutWRte_RvrtTms - faellt openHAB mit aktivem
// Remote EMS aus, bleibt der kommandierte Zustand stehen. Der Kern setzt
// ausserhalb der Fenster in jedem 5-Minuten-Zyklus zurueck; das Restrisiko
// und der Spike-Punkt dazu stehen im README.md des Profils
// (SIGEN_HAS_AUTO_REVERT unten dokumentiert den Spike-Befund).
//
// Sicherung gegen das falsche Geraet / die falsche Registerkarte:
// geschrieben wird nur, wenn der EMS-Modus lesbar und die
// Nennentladeleistung plausibel ist.
// ============================================================================

// --- Geraetekonstanten - IM SPIKE VERIFIZIEREN (README.md des Profils) ------

// Remote-EMS-Modi laut Appendix 6 (V1.7): 5 = Command discharging (output
// from PV first), 6 = Command discharging (output from ESS first)
var SIGEN_MODE_PREVENT_CHARGE = 5;
var SIGEN_MODE_FORCE_DISCHARGE = 6;

// Kennt die Firmware ein automatisches Zuruecksetzen bei Kommunikations-
// verlust? Stand Protokoll V1.7: nein - und am Geraet bestaetigt: Spike-
// Punkt 9 am 2026-10-02 (Anlage 223, EC 10.0): eine kommandierte Entladung
// stand ~85 s unveraendert (EMS-Modus 7, -2000 W), bis sie per Reset
// geraeumt wurde. Der root-Timer ibm-failsafe ist damit Pflicht.
// (nur Doku - es gibt kein Register, das der Adapter dafuer schreiben kann).
var SIGEN_HAS_AUTO_REVERT = false;

// Plausibilitaetsfenster fuer die Nennentladeleistung in Watt
var SIGEN_RATED_MIN_W = 100;
var SIGEN_RATED_MAX_W = 1000000;

// PV-Limit-Freigabewert, falls das Anlagenmaximum (30010) nicht lesbar ist
var SIGEN_PV_LIMIT_FALLBACK_W = 100000;

// --- Helfer -----------------------------------------------------------------

function __ibmSgItem(name) {
  try {
    var item = items.getItem(name);
    return (item === null || item === undefined) ? null : item;
  } catch (e) {
    return null;
  }
}

function __ibmSgSend(name, value) {
  var item = __ibmSgItem(name);
  if (item === null) {
    console.log('[IBM][Adapter] Item fehlt: ' + name);
    return false;
  }
  try {
    item.sendCommand(value);
    return true;
  } catch (e) {
    console.log('[IBM][Adapter] sendCommand ' + name + '=' + value + ' fehlgeschlagen: ' + e);
    return false;
  }
}

function __ibmSgNum(name) {
  var item = __ibmSgItem(name);
  if (item === null) return null;
  var value = parseFloat(item.numericState);
  return isNaN(value) ? null : value;
}

// Zustellbarkeit: der Modbus-Pfad zur Anlage muss ONLINE sein. openHABs
// sendCommand wirft bei deaktivierter oder abgerissener Bridge KEINE
// Exception - der Befehl verpufft nur. Ohne diese Pruefung meldete
// ibmReset() ok=true, der Kern beruehrte den Fail-Safe-Heartbeat, und der
// Timer schlief weiter, obwohl die Anlage nie erreicht wurde (Testplan
// Zeile 13 an Anlage 223, 2026-10-02, siehe ../failsafe-modbus.md 8b).
// Geprueft wird das Wechselrichter-Thing @IBM_THING_UID@ (Platzhalter,
// setup/04-install-rules.sh) - im Modbus-Baum ein Data-Thing, das nur
// ONLINE ist, wenn Bridge, Poller und Data-Thing arbeiten; dasselbe
// Thing, auf dessen ONLINE 02b wartet und das der Watchdog ueberwacht.
// Fehlt es, ist nichts zustellbar. Bewusst fail-closed: jedes false
// heisst ok=false -> kein Heartbeat -> der Timer uebernimmt.
function __ibmSgThingStatus(uid) {
  try {
    var thing = things.getThing(uid);
    if (thing === null || thing === undefined) return null;
    if (thing.status !== undefined && thing.status !== null) return String(thing.status);
    if (thing.rawThing) return String(thing.rawThing.getStatus());
  } catch (e) {
    // nicht vorhanden oder API-Fehler -> wie "fehlt" behandeln
  }
  return null;
}

function __ibmSgDeliverable() {
  var status = __ibmSgThingStatus('@IBM_THING_UID@');
  if (status === null) {
    console.log('[IBM][Adapter] Wechselrichter-Thing @IBM_THING_UID@ fehlt - nichts zustellbar, der Fail-Safe-Timer uebernimmt.');
    return false;
  }
  if (status !== 'ONLINE') {
    console.log('[IBM][Adapter] Wechselrichter-Thing nicht ONLINE (' + status + ') - Kommando nicht zustellbar, der Fail-Safe-Timer uebernimmt.');
    return false;
  }
  return true;
}

// Nennentladeleistung in Watt - oder null, wenn der Modbus-Pfad nicht
// ONLINE ist oder die Anlage nicht wie eine SigenStor antwortet (EMS-Modus
// unlesbar, Nennleistung unplausibel). Solange null, wird NIE geschrieben.
function __ibmSgGuard() {
  if (!__ibmSgDeliverable()) return null;
  var emsMode = __ibmSgNum('IBM_SG_EmsMode');
  if (emsMode === null || emsMode < 0 || emsMode > 10) {
    console.log('[IBM][Adapter] EMS-Modus unlesbar oder unplausibel (gelesen: ' + emsMode + ') - keine Steuerung. Registerkarte/Slave-Adresse pruefen.');
    return null;
  }
  var ratedW = __ibmSgNum('IBM_SG_RatedDischargeW');
  if (ratedW === null || ratedW < SIGEN_RATED_MIN_W || ratedW > SIGEN_RATED_MAX_W) {
    console.log('[IBM][Adapter] Nennentladeleistung unplausibel (' + ratedW + ' W) - keine Steuerung.');
    return null;
  }
  return ratedW;
}

// PV-Limit freigeben: auf das Anlagenmaximum setzen, damit ein Altwert im
// Register die PV-Erzeugung im Kommando-Modus nicht begrenzt.
function __ibmSgReleasePvLimit() {
  var maxW = __ibmSgNum('IBM_SG_MaxActiveW');
  if (maxW === null || maxW < 1000) maxW = SIGEN_PV_LIMIT_FALLBACK_W;
  return __ibmSgSend('IBM_SG_PvLimitW', Math.round(maxW));
}

// --- Adapter-Kontrakt -------------------------------------------------------

function ibmReset() {
  // Werksverhalten: Remote EMS aus, die Anlage folgt wieder ihrem
  // konfigurierten EMS-Modus (Eigenverbrauch, TOU, ...).
  // ok=true NUR, wenn der Befehl die Anlage erreichen konnte - der Kern
  // beruehrt den Fail-Safe-Heartbeat nur bei ok=true (core.js).
  if (!__ibmSgDeliverable()) return { ok: false };
  var ok = __ibmSgSend('IBM_SG_RemoteEnable', 0);
  return { ok: ok };
}

function ibmPreventCharge(minutes) {
  if (__ibmSgGuard() === null) return { ok: false };
  // Kein geraeteseitiges Auto-Revert (SIGEN_HAS_AUTO_REVERT) - "minutes"
  // traegt der Kern, der den Befehl im Fenster zyklisch erneuert und
  // danach zuruecksetzt.
  var ok = __ibmSgReleasePvLimit();
  ok = __ibmSgSend('IBM_SG_DischargeLimitW', 0) && ok;
  ok = __ibmSgSend('IBM_SG_RemoteMode', SIGEN_MODE_PREVENT_CHARGE) && ok;
  ok = __ibmSgSend('IBM_SG_RemoteEnable', 1) && ok;
  return { ok: ok };
}

function ibmForceDischarge(watts, minutes) {
  var ratedW = __ibmSgGuard();
  if (ratedW === null) return { ok: false };

  // Sigenergy nimmt das Entladelimit direkt in Watt, begrenzt auf die
  // Nennentladeleistung der Anlage.
  var w = Math.round(watts);
  if (w < 0) w = 0;
  if (w > ratedW) w = ratedW;

  var ok = __ibmSgReleasePvLimit();
  ok = __ibmSgSend('IBM_SG_DischargeLimitW', w) && ok;
  ok = __ibmSgSend('IBM_SG_RemoteMode', SIGEN_MODE_FORCE_DISCHARGE) && ok;
  ok = __ibmSgSend('IBM_SG_RemoteEnable', 1) && ok;

  return { ok: ok, appliedW: w };
}
