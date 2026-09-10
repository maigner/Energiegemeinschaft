// ============================================================================
// IBM - Wechselrichter-Adapter: Fronius Symo Hybrid (SnapINverter, Modbus)
//
// Definiert die Funktionen des Adapter-Kontrakts (siehe control/core.js),
// einschliesslich des optionalen ibmLimitCharge (InWRte ist im Storage-Model
// genau das Ladelimit - die Laderegelung des Kerns kommandiert hier direkt
// statt per PWM), ueber das SunSpec Basic Storage Control Model (124), das
// der Datamanager per Modbus TCP bereitstellt. Die Register haengen als
// Items an den Data-Things des Setups (inverter_things_json im Profil):
//
//   IBM_MB_ModelId   SunSpec-Model-ID an der Basisadresse (muss 124 sein)
//   IBM_MB_WChaMax   Referenzleistung fuer die Prozentwerte (roh)
//   IBM_MB_StorCtl   StorCtl_Mod-Bitfeld (Bit 0: InWRte aktiv, Bit 1: OutWRte aktiv)
//   IBM_MB_InWRte    Ladelimit in % von WChaMax (roh, negativ = Entladung)
//   IBM_MB_OutWRte   Entladelimit in % von WChaMax (roh, negativ = Ladung)
//   IBM_MB_RvrtTms   Revert-Timeout in Sekunden (nur lesend, siehe unten)
//
// Fronius-Semantik (Anleitung "Datamanager Modbus TCP & RTU", 42,0410,2049,
// S. 45-47): InWRte und OutWRte spannen ein Leistungsfenster auf, negative
// Werte = Ladung, positive = Entladung, jeweils in % von WChaMax. Die
// Beispiele dort sind die Vorlage der Kommandos:
//   Beispiel 2 "nur Entladen erlauben" = Ladesperre: InWRte=0, StorCtl_Mod=1
//   Beispiel 6 "Entladen mit x %"      = forcierte Entladung:
//                                        InWRte=-x, OutWRte=x, StorCtl_Mod=3
// Alle Vorgaben sind Empfehlungen; der Wechselrichter darf aus Gruenden
// der Betriebssicherheit abweichen.
//
// Fail-Safe: Modbus-Writes bleiben stehen, wenn openHAB ausfaellt - anders
// als die selbst ablaufenden GEN24-Schedules. SunSpec saehe dafuer
// InOutWRte_RvrtTms vor, aber die Fronius-Registerkarte (docs/
// registerkarten, Blatt IC124) fuehrt das Register als "Not supported" und
// nur lesbar. M124_HAS_RVRTTMS steht deshalb auf false; der Fail-Safe ist
// der zyklische Reset des Kerns (Restrisiko siehe README, Fail-Safe-
// Analyse). Sollte der Spike (Punkt 7) wider Erwarten ein wirksames
// Revert-Timeout nachweisen, M124_HAS_RVRTTMS auf true setzen und das
// Register im Profil wieder beschreibbar machen.
//
// Sicherung gegen das falsche Geraet (z. B. den Nicht-Hybrid-Slave einer
// Master/Slave-Anlage): geschrieben wird nur, wenn die Model-ID 124 lautet
// und WChaMax plausibel ist - ein Wechselrichter ohne Batterie hat beides
// nicht.
//
// Dieser Adapter ist die Vorlage fuer jeden Hersteller mit beschreibbarem
// SunSpec Model 124: kopieren, Itemnamen/Registerkarte im Profil anpassen,
// Konstanten unten am Geraet verifizieren - der Kern bleibt unangetastet.
// ============================================================================

// --- Geraetekonstanten - IM SPIKE VERIFIZIEREN (README.md des Profils) ------

// Unterstuetzt das Geraet InOutWRte_RvrtTms (automatisches Zuruecksetzen)?
// Laut Registerkarte 1.1.5-1 nein ("Not supported", R) - Spike-Punkt 7.
var M124_HAS_RVRTTMS = false;

// Registereinheiten je Prozent fuer InWRte/OutWRte (InOutWRte_SF = -2 -> 100)
var M124_WRTE_RAW_PER_PCT = 100;

// Watt je Registereinheit fuer WChaMax (WChaMax_SF = 0 -> 1)
var M124_WCHAMAX_W_PER_UNIT = 1;

// StorCtl_Mod-Bits: Bit 0 aktiviert das Ladelimit (InWRte), Bit 1 das
// Entladelimit (OutWRte) - Anleitung S. 46, Bit-Muster 01 / 10 / 11.
var M124_STORCTL_CHARGE_BIT = 1;
var M124_STORCTL_DISCHARGE_BIT = 2;

// Plausibilitaetsfenster fuer WChaMax in Watt
var M124_WCHAMAX_MIN_W = 500;
var M124_WCHAMAX_MAX_W = 50000;

// --- Helfer -----------------------------------------------------------------

function __ibmMbItem(name) {
  try {
    var item = items.getItem(name);
    return (item === null || item === undefined) ? null : item;
  } catch (e) {
    return null;
  }
}

function __ibmMbSend(name, value) {
  var item = __ibmMbItem(name);
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

function __ibmMbNum(name) {
  var item = __ibmMbItem(name);
  if (item === null) return null;
  var value = parseFloat(item.numericState);
  return isNaN(value) ? null : value;
}

// Maximale Lade-/Entladeleistung in Watt - oder null, wenn an der
// Basisadresse kein Storage-Model liegt oder WChaMax unplausibel ist.
// Solange null, wird NIE geschrieben.
function __ibmMbGuard() {
  var modelId = __ibmMbNum('IBM_MB_ModelId');
  if (modelId !== 124) {
    console.log('[IBM][Adapter] Kein SunSpec Model 124 an der Basisadresse (gelesen: ' + modelId + ') - keine Steuerung. Registerkarte/Unit-ID pruefen.');
    return null;
  }
  var raw = __ibmMbNum('IBM_MB_WChaMax');
  var maxW = (raw === null) ? null : raw * M124_WCHAMAX_W_PER_UNIT;
  if (maxW === null || maxW < M124_WCHAMAX_MIN_W || maxW > M124_WCHAMAX_MAX_W) {
    console.log('[IBM][Adapter] WChaMax unplausibel (' + maxW + ' W) - keine Steuerung.');
    return null;
  }
  return maxW;
}

// Revert-Timeout scharf stellen: Fensterlaenge plus eine Minute Reserve.
function __ibmMbArmRevert(minutes) {
  if (!M124_HAS_RVRTTMS) return;
  __ibmMbSend('IBM_MB_RvrtTms', Math.round(minutes * 60 + 60));
}

// --- Adapter-Kontrakt -------------------------------------------------------

function ibmReset() {
  // Werksverhalten: keine aktive Steuerung, beide Limits auf 100 %.
  var ok = __ibmMbSend('IBM_MB_InWRte', 100 * M124_WRTE_RAW_PER_PCT);
  ok = __ibmMbSend('IBM_MB_OutWRte', 100 * M124_WRTE_RAW_PER_PCT) && ok;
  ok = __ibmMbSend('IBM_MB_StorCtl', 0) && ok;
  return { ok: ok };
}

function ibmPreventCharge(minutes) {
  // Beispiel 2 der Anleitung: Ladelimit 0 %, nur Bit 0 aktiv -> Fenster
  // [0, +WChaMax], Entladung fuer den Haushalt bleibt erlaubt.
  if (__ibmMbGuard() === null) return { ok: false };
  __ibmMbArmRevert(minutes);
  var ok = __ibmMbSend('IBM_MB_InWRte', 0);
  ok = __ibmMbSend('IBM_MB_StorCtl', M124_STORCTL_CHARGE_BIT) && ok;
  return { ok: ok };
}

function ibmLimitCharge(watts, minutes) {
  // InWRte IST das Ladelimit des Storage-Models (Prozent von WChaMax) -
  // die Laderegelung des Kerns kann hier direkt kommandieren, samt
  // geraeteseitigem Auto-Revert. Geladen wird weiter nur aus PV; das
  // Limit deckelt nur die Leistung.
  var maxW = __ibmMbGuard();
  if (maxW === null) return { ok: false };

  var pct = Math.round(watts / maxW * 100);
  if (pct < 1) pct = 1;
  if (pct > 100) pct = 100;

  __ibmMbArmRevert(minutes);
  var ok = __ibmMbSend('IBM_MB_InWRte', pct * M124_WRTE_RAW_PER_PCT);
  ok = __ibmMbSend('IBM_MB_StorCtl', M124_STORCTL_CHARGE_BIT) && ok;

  return { ok: ok, appliedW: Math.round(maxW * pct / 100) };
}

function ibmForceDischarge(watts, minutes) {
  var maxW = __ibmMbGuard();
  if (maxW === null) return { ok: false };

  // Watt -> Prozent von WChaMax, auf ganze Prozent gerundet und begrenzt.
  var pct = Math.round(watts / maxW * 100);
  if (pct < 1) pct = 1;
  if (pct > 100) pct = 100;

  __ibmMbArmRevert(minutes);
  // Beispiel 6 der Anleitung ("Entladen mit x % der nominalen Leistung"):
  // Ladelimit -x % und Entladelimit +x % ergeben das feste Fenster
  // [-x, -x] = Entladung mit genau x % von WChaMax; dafuer muessen BEIDE
  // Limits aktiv sein (StorCtl_Mod = 3). Reihenfolge: erst die Limits,
  // dann das Bitfeld, damit kein Zwischenzustand mit alten Limits wirkt.
  var raw = pct * M124_WRTE_RAW_PER_PCT;
  var ok = __ibmMbSend('IBM_MB_InWRte', -raw);
  ok = __ibmMbSend('IBM_MB_OutWRte', raw) && ok;
  ok = __ibmMbSend('IBM_MB_StorCtl', M124_STORCTL_CHARGE_BIT | M124_STORCTL_DISCHARGE_BIT) && ok;

  return { ok: ok, appliedW: Math.round(maxW * pct / 100) };
}
