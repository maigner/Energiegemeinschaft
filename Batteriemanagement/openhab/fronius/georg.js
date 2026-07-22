// ============================================================================
// Skript: Fronius Batteriesteuerung – kombiniert
//   Teil A: Batterieladen sperren bei geringer Bewoelkung (07:00–10:59 Uhr)
//   Teil B: Forcierte Batterieentladung nachts (21:00–06:59 Uhr),
//           abhaengig von Toggle, SoC und Wolkenvorschau
// ============================================================================

// --- Konfiguration (Konstanten) ---
var fa = actions.thingActions('fronius', 'fronius:powerinverter:0cb68e8e38:273b6c06b4');

// Standardwerte fuer Entladeleistung
var DEFAULT_MIN_DISCHARGE_W = 1000;
var DEFAULT_MAX_DISCHARGE_W = 3000;

// Zeitfenster
var CHARGE_LOCK_START_HOUR = 7;
var CHARGE_LOCK_END_HOUR = 11;
var FORCED_DISCHARGE_START_HOUR = 21;
var FORCED_DISCHARGE_END_HOUR = 7;

// Schwellenwert fuer Wolkenvorschau (Ladesperre)
var CLOUD_THRESHOLD_CHARGE_LOCK = 75;

// --- Skript-Logik ---
var now = time.ZonedDateTime.now();
var hour = now.hour();

// ----------------------------------------------------------------------------
// Gemeinsamer Schritt: Toggle-abhaengiger Reset
// ----------------------------------------------------------------------------
var toggle = items.getItem('Schalte_ISCHLSTROM_Empfehlung_einaus');
var toggleOn = (toggle.state === 'ON');

if (toggleOn) {
  fa.resetBatteryControl();
  console.log('[IBM] Toggle=ON - Battery control reset');
} else {
  console.log('[IBM] Toggle=OFF - Tue nichts');
  return;
}

// ----------------------------------------------------------------------------
// Teil A: Ladesperre bei geringer Bewoelkung (nur 07:00-10:59 Uhr)
// ----------------------------------------------------------------------------
function handleChargeLock() {
  var clouds = parseFloat(items.getItem('Ischlstrom_Wolkenvorschau').numericState);
  if (isNaN(clouds) || clouds < 0 || clouds > 100) {
    console.log('[IBM][Ladesperre] Wolkenvorschau invalid (' + clouds + '%) - abort');
    return;
  }
  if (clouds >= CLOUD_THRESHOLD_CHARGE_LOCK) {
    console.log('[IBM][Ladesperre] Wolkenvorschau=' + clouds + '% - Laden wird nicht gesperrt');
    return;
  }

  // Laden sperren
  var from = now;
  var until = now.plusMinutes(5);
  var ok = fa.addPreventBatteryChargingSchedule(from, until);

  console.log('[IBM][Ladesperre] Wolkenvorschau=' + clouds + '% (<' + CLOUD_THRESHOLD_CHARGE_LOCK + '%) - Laden gesperrt | Schedule applied: ' + ok);
  console.log('[IBM][Ladesperre] From:  ' + from);
  console.log('[IBM][Ladesperre] Until: ' + until);
}

// ----------------------------------------------------------------------------
// Teil B: Forcierte Entladung (nur 21:00-06:59 Uhr, nur wenn Toggle=ON)
// ----------------------------------------------------------------------------
function handleForcedDischarge() {

  var soc = parseFloat(items.getItem('Fronius_Symo_Inverter_Battery_State_of_Charge').numericState);
  var minSoc = parseFloat(items.getItem('IBM_MIN_BATTERY_CHARGE').numericState);

  if (isNaN(minSoc) || minSoc <= 5 || minSoc > 90) {
    console.log('[IBM][Entladung] Battery min Level (' + minSoc + '%) - invalid value');
    return;
  }
  if (isNaN(soc) || soc <= minSoc) {
    console.log('[IBM][Entladung] Battery too low (' + soc + '%) - skipping discharge schedule');
    return;
  }

  var dischargeMinW = parseFloat(items.getItem('Minimale_Entladeleistung_Batterieeinspeisung').numericState);
  var dischargeMaxW = parseFloat(items.getItem('Maximale_Entladeleistung_Batterieeinspeisung').numericState);

  if (isNaN(dischargeMinW) || dischargeMinW <= 0) {
    console.log('[IBM][Entladung] Minimale Entladeleistung invalid (' + dischargeMinW + 'W) - using default ' + DEFAULT_MIN_DISCHARGE_W + 'W');
    dischargeMinW = DEFAULT_MIN_DISCHARGE_W;
  }
  if (isNaN(dischargeMaxW) || dischargeMaxW <= 0) {
    console.log('[IBM][Entladung] Maximale Entladeleistung invalid (' + dischargeMaxW + 'W) - using default ' + DEFAULT_MAX_DISCHARGE_W + 'W');
    dischargeMaxW = DEFAULT_MAX_DISCHARGE_W;
  }
  if (dischargeMinW >= dischargeMaxW) {
    console.log('[IBM][Entladung] minW >= maxW (' + dischargeMinW + ' >= ' + dischargeMaxW + ') - using defaults');
    dischargeMinW = DEFAULT_MIN_DISCHARGE_W;
    dischargeMaxW = DEFAULT_MAX_DISCHARGE_W;
  }
  console.log('[IBM][Entladung] Entladeleistung: min=' + dischargeMinW + 'W, max=' + dischargeMaxW + 'W');

  var clouds = parseFloat(items.getItem('Ischlstrom_Wolkenvorschau').numericState);
  if (isNaN(clouds) || clouds < 0 || clouds > 100) {
    console.log('[IBM][Entladung] Wolkenvorschau (' + clouds + '%) - invalid value, using maxW');
    clouds = 0;
  }

  // 0% Wolken -> maxW, 100% Wolken -> minW (linear interpoliert)
  var dischargeW = Math.round(dischargeMaxW - (clouds / 100) * (dischargeMaxW - dischargeMinW));
  console.log('[IBM][Entladung] Wolkenvorschau=' + clouds + '% -> dischargeW=' + dischargeW + 'W');

  var from = now;
  var until = now.plusMinutes(5);
  var ok = fa.addForcedBatteryDischargingSchedule(from, until, Quantity(dischargeW + 'W'));

  console.log('[IBM][Entladung] SoC=' + soc + '% | Schedule applied: ' + ok);
  console.log('[IBM][Entladung] From:  ' + from);
  console.log('[IBM][Entladung] Until: ' + until);
}

// ----------------------------------------------------------------------------
// Zeitfenster-Weiche: entscheidet, welcher Teil ausgefuehrt wird
// ----------------------------------------------------------------------------
if (hour >= CHARGE_LOCK_START_HOUR && hour < CHARGE_LOCK_END_HOUR) {
  console.log('[IBM] Zeitfenster Vormittag (' + hour + ':xx) - pruefe Ladesperre');
  handleChargeLock();
} else if (hour >= FORCED_DISCHARGE_START_HOUR || hour < FORCED_DISCHARGE_END_HOUR) {
  console.log('[IBM] Zeitfenster Nacht (' + hour + ':xx) - pruefe forcierte Entladung');
  handleForcedDischarge();
} else {
  console.log('[IBM] Ausserhalb beider Zeitfenster (' + hour + ':xx) - keine Aktion');
}