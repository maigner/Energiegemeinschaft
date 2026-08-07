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
// verlust? Stand Protokoll V1.7: nein. Ergebnis des Spikes hier festhalten
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

// Nennentladeleistung in Watt - oder null, wenn die Anlage nicht wie eine
// SigenStor antwortet (EMS-Modus unlesbar, Nennleistung unplausibel).
// Solange null, wird NIE geschrieben.
function __ibmSgGuard() {
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
