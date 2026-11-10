const pptxgen = require("pptxgenjs");
const { applyTheme } = require("/home/martin/.claude/skills/synced/7558581c-ad2d-43d8-8083-711e6012ecbc_bd1a6271-9618-43f5-b020-8a6b576bf129/pptx/scripts/apply_theme.js");

const THEME = {
  name: "ISCHLSTROM",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1F2A1A", lt1: "FFFFFF", dk2: "2C551F", lt2: "F1FAEB",
    accent1: "418A26", accent2: "5CB837", accent3: "E08A1E", accent4: "1F5FB4",
    accent5: "C8302B", accent6: "8A9097", hlink: "418A26", folHlink: "346A21",
  },
};

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.author = "Martin Aigner";
  pres.company = "Erneuerbare-Energie-Gemeinschaft ISCHLSTROM";
  pres.title = "Speichermanagement ISCHLSTROM";
  pres.lang = "de-AT";
  const C = pres.SchemeColor;

  // Titelfolie: Gruppenfoto links im Originalformat, Logo und Titel rechts
  pres.defineSlideMaster({
    title: "titel",
    background: { color: C.background1 },
    objects: [
      { image: { x: 0.4, y: 1.05, w: 5.7, h: 3.514, path: "gruppenfoto.jpg" } },
      { image: { x: 6.45, y: 1.0, w: 2.8, h: 1.597, path: "logo.png" } },
      { placeholder: { options: { name: "title", type: "title", x: 6.45, y: 2.85, w: 3.3, h: 0.5, fontSize: 24, bold: true, color: C.text2, margin: 0, valign: "top", align: "left" }, text: "Titel" } },
      { placeholder: { options: { name: "body", type: "body", x: 6.45, y: 3.38, w: 3.3, h: 0.9, fontSize: 13, color: C.text1, margin: 0, valign: "top" }, text: "Untertitel" } },
      { placeholder: { options: { name: "presenter", type: "body", x: 6.45, y: 4.3, w: 3.3, h: 0.8, fontSize: 12, color: C.text1, margin: 0, valign: "top" }, text: "Vortragende Person" } },
    ],
  });

  // Bildfolie: Whiteboard-Grafik, Logo klein unten rechts
  pres.defineSlideMaster({
    title: "bild",
    background: { color: C.background1 },
    objects: [
      { image: { x: 8.55, y: 5.05, w: 0.88, h: 0.5, path: "logo.png" } },
      { text: { text: "ischlstrom.org", options: { x: 0.7, y: 5.12, w: 2.5, h: 0.35, fontSize: 10, color: C.accent6, margin: 0 } } },
    ],
    slideNumber: { x: 4.6, y: 5.12, w: 0.8, h: 0.35, fontSize: 10, color: C.accent6, align: "center" },
  });

  pres.addSection({ title: "Speichermanagement" });

  const s1 = pres.addSlide({ masterName: "titel", sectionTitle: "Speichermanagement" });
  s1.addText("Speichermanagement", { placeholder: "title" });
  s1.addText("Heimspeicher der Mitglieder versorgen die Energiegemeinschaft durch die Nacht", { placeholder: "body" });
  s1.addText([
    { text: "Martin Aigner", options: { bold: true, fontSize: 14, breakLine: true } },
    { text: "Energiegemeinschaft ISCHLSTROM, Bad Ischl", options: { color: C.accent6, fontSize: 11 } },
  ], { placeholder: "presenter" });
  s1.addNotes("Titelfolie. Vorstand der Energiegemeinschaft ISCHLSTROM auf dem Gruppenfoto.");

  const bilder = [
    ["01-aufbau.png", "Aufbau: Rechner im Haushalt, Server der Gemeinschaft, Datenfluesse",
     "Im Haushalt steuert ein kleiner Rechner den Wechselrichter mit Batterie. Er holt Prognose und Wetter vom Server ischlstrom.org und meldet den Zustand zurueck. Der Server rechnet aus den Energiedaten aller Mitglieder und der Wettervorhersage den Bedarf der Gemeinschaft je Viertelstunde."],
    ["02-tagesablauf.png", "Ein Tag: gedrosselt laden, nachts in die Gemeinschaft einspeisen",
     "Tagsueber laedt die Batterie nur so schnell, dass sie zum Sonnenuntergang voll ist; der Ueberschuss versorgt die Nachbarn. Nachts speist sie ein, solange die Gemeinschaft mehr verbraucht als erzeugt. Eine Reserve fuer das Haus bleibt. Grau gestrichelt: bisheriges Verhalten."],
    ["03-regelkreis.png", "Regelkreis und Sicherheitsnetz",
     "Server rechnet, Rechner entscheidet lokal, Wechselrichter fuehrt aus. Befehle gelten nur fuenf Minuten; ohne Befehl, Internet oder Prognose verhaelt sich die Anlage wie ohne Steuerung. Hauptschalter beim Mitglied, Laden nur aus eigener PV."],
  ];
  for (const [file, alt, notes] of bilder) {
    const s = pres.addSlide({ masterName: "bild", sectionTitle: "Speichermanagement" });
    s.addImage({ path: file, x: 0.7, y: 0.22, w: 8.6, h: 4.8375, altText: alt, objectName: alt.split(":")[0] });
    s.addNotes(notes);
  }

  await pres.writeFile({ fileName: "speichermanagement-whiteboards.pptx" });
  await applyTheme("speichermanagement-whiteboards.pptx", THEME);
  console.log("ok");
})();
