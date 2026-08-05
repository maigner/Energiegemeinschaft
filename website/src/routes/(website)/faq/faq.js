// Fragenkatalog der FAQ-Seite. Neue Fragen hier ergaenzen; die Seite
// rendert Sprungleiste, Sektionen und Accordions generisch aus diesem
// Katalog und erzeugt daraus auch das FAQPage-JSON-LD fuer Suchmaschinen.

const STATUTEN_URL =
    "https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf";

/**
 * @param {{progressPercent: number} | null} batteryGoal - Fortschritt zum
 * Speicherziel (buildBatteryGoal), fuer die Antwort zum Nachtziel; ohne
 * Kennzahl bleibt die Antwort allgemein.
 */
export const getFaqCategories = (batteryGoal) => [
    {
        id: "mitmachen",
        title: "Mitmachen",
        questions: [
            {
                question: "Brauche ich eine eigene PV-Anlage?",
                answer: "Nein. Auch wer nur Strom verbraucht, ist willkommen und bezieht Sonnenstrom aus der Nachbarschaft. Für die Gemeinschaft sind beide Seiten wichtig: Erzeuger und Verbraucher.",
            },
            {
                question: "Brauche ich einen Smart Meter?",
                answer: "Ja, die Teilnahme setzt einen Smart Meter voraus, der viertelstündlich misst. Die Netz Oberösterreich verbaut diese standardmäßig, in den meisten Haushalten ist er also bereits vorhanden. Ob Ihr Zähler schon umgestellt ist, sehen Sie im eService-Portal der Netz Oberösterreich.",
            },
            {
                question: "Muss ich meinen Stromlieferanten kündigen?",
                answer: "Nein, keinesfalls. Sie brauchen weiterhin Ihren eigenen Stromanbieter: Er liefert den Strom, wenn die Gemeinschaft gerade zu wenig Sonnenstrom erzeugt, und nimmt Überschüsse ab, für die es in der Gemeinschaft gerade keinen Bedarf gibt. Die Mitgliedschaft bei ISCHLSTROM ergänzt Ihren Stromvertrag, sie ersetzt ihn nicht.",
            },
            {
                question: "Wie läuft der Beitritt ab?",
                answer: "In zwei Schritten: Zuerst melden Sie sich mit Ihrer E-Mail-Adresse bei ISCHLSTROM an und füllen das Bewerbungsformular aus. Danach registrieren Sie sich im eService-Portal der Netz Oberösterreich und geben dort Ihre Zählpunkte für ISCHLSTROM frei. Bis zur Aufnahme in die Gemeinschaft entstehen Ihnen keine Kosten.",
                link: "/mitmachen",
                linkLabel: "Zur Mitmachen-Seite mit Anleitung",
            },
        ],
    },
    {
        id: "kosten",
        title: "Kosten & Abrechnung",
        questions: [
            {
                question: "Wie hoch ist der aktuelle Einspeisetarif?",
                answer: "9,5 Cent/kWh (seit 1.1.2026) bekommt, wer Sonnenstrom in die Gemeinschaft einspeist.",
            },
            {
                question: "Wie hoch ist der aktuelle Bezugstarif?",
                answer: "10 Cent/kWh (seit 1.1.2026) zahlt, wer Sonnenstrom aus der Gemeinschaft bezieht.",
            },
            {
                question: "Wie hoch ist der Mitgliedsbeitrag?",
                answer: "Seit 1.1.2026 fällt kein Mitgliedsbeitrag mehr an.",
            },
            {
                question: "Wie und wann wird abgerechnet?",
                answer: "Einmal pro Quartal. Wer Strom aus der Gemeinschaft bezogen hat, zahlt bequem per SEPA-Lastschrift; wer eingespeist hat, bekommt sein Guthaben per Überweisung gutgeschrieben.",
            },
            {
                question:
                    "Sind die Stromkosten in Brutto- oder Nettopreisen angegeben?",
                answer: "Es handelt sich um Nettopreise. Unser Umsatz ist unter den Grenzen zur Umsatzsteuerpflicht.",
            },
            {
                question: "Wie viel wird bei den Netzkosten eingespart?",
                answer: "Wir sind eine regionale EEG, weshalb sich die Netzkosten für jede verteilte kWh um 28% reduzieren.",
                source: "https://energiegemeinschaften.gv.at/formen-von-energiegemeinschaften/",
            },
        ],
    },
    {
        id: "batteriemanagement",
        title: "Batteriemanagement",
        questions: [
            {
                question:
                    "Was ist das ISCHLSTROM Batteriemanagement (IBM)?",
                answer: "Heimspeicher unserer Mitglieder geben am Abend das ab, was sie übrig haben, und versorgen so die Nachbarschaft nach Sonnenuntergang mit Sonnenstrom. Ein kleiner Computer neben dem Wechselrichter steuert das automatisch.",
                link: "/ibm",
                linkLabel: "Mehr zum Batteriemanagement",
            },
            {
                question: "Welche Anlagen werden unterstützt?",
                answer: "Derzeit Wechselrichter von Fronius (GEN24), weitere Hersteller sind in Vorbereitung. Die Hardware kostet einmalig etwa 150 Euro, laufende Kosten gibt es keine.",
            },
            {
                question: "Bekomme ich etwas dafür?",
                answer: "Ja. Für Strom, den Ihre Batterie am Abend und in der Nacht einspeist, bekommen Sie 9,5 Cent pro kWh, deutlich mehr als die übliche Einspeisevergütung untertags.",
            },
            {
                question: "Bleibt genug Strom für meinen Haushalt?",
                answer: "Ja, der eigene Haushalt hat immer Vorrang. Die Batterie lädt ausschließlich aus der eigenen PV-Anlage, ein Mindest-Ladestand bleibt immer erhalten, und Sie können das Batteriemanagement jederzeit pausieren oder ausschalten.",
            },
            {
                question: "Was ist das Speicherziel?",
                answer: `Wir wollen den nächtlichen Strombedarf der Gemeinschaft vollständig aus den Batterien unserer Mitglieder decken, damit nachts kein Mitglied Strom von außerhalb beziehen muss.${
                    batteryGoal
                        ? ` Derzeit sind rund ${batteryGoal.progressPercent}% geschafft.`
                        : ""
                } Den aktuellen Stand zeigt der Fortschrittsbalken auf der IBM-Seite.`,
                link: "/ibm",
                linkLabel: "Zum Speicherziel",
            },
        ],
    },
    {
        id: "daten",
        title: "Prognose & Daten",
        questions: [
            {
                question: "Was zeigt die Energieprognose?",
                answer: "Wie viel Strom die Gemeinschaft in den nächsten Tagen voraussichtlich erzeugt und verbraucht, berechnet aus der Wettervorhersage und unseren Messdaten und täglich aktualisiert. Auch wie treffsicher die Prognose bisher war, ist dort offen einsehbar.",
                link: "/vorhersage",
                linkLabel: "Zur Energieprognose",
            },
            {
                question: "Woher kommen die Zahlen auf der Website?",
                answer: "Aus unseren Betriebsdaten: den viertelstündlichen Messwerten der Netz Oberösterreich sowie den Statusmeldungen der Batterien im Batteriemanagement. Die Kennzahlen auf der Website aktualisieren sich laufend.",
            },
            {
                question: "Welche Daten sehe ich als Mitglied?",
                answer: "Im Mitgliederbereich sehen Sie Ihre eigenen Zählpunkte und Ihren Verbrauch bzw. Ihre Einspeisung innerhalb der Gemeinschaft.",
                link: "/user",
                linkLabel: "Zum Mitgliederbereich",
            },
            {
                question: "Welche Daten gibt ISCHLSTROM weiter?",
                answer: "Keine. Ihre Messdaten verwenden wir ausschließlich für die Abrechnung und die Darstellung in Ihrem Mitgliederbereich. Öffentlich zeigen wir nur anonymisierte Summen der ganzen Gemeinschaft.",
            },
        ],
    },
    {
        id: "verein",
        title: "Verein & Recht",
        questions: [
            {
                question: "Wie ist der Verein strukturiert?",
                answer: "ISCHLSTROM ist ein Verein und nicht auf Gewinn ausgerichtet. Alle Details regeln die Statuten.",
                source: STATUTEN_URL,
            },
            {
                question: "Wie wird der Strompreis festgelegt?",
                answer: "Die Mitglieder stimmen in der Generalversammlung über einen Vorschlag des Vereinsvorstandes ab. Jedes Mitglied kann mitbestimmen.",
            },
            {
                question:
                    "Was ist das ElWG und was ändert sich für ISCHLSTROM?",
                answer: "Das neue Elektrizitätswirtschaftsgesetz (ElWG) löst die bisherigen Regeln für Energiegemeinschaften ab. Am 1. Oktober 2026 wird ISCHLSTROM automatisch in das neue System der gemeinsamen Energienutzung übergeführt. Die Gemeinschaft bleibt bestehen, es ist keine Neugründung notwendig.",
                source: "https://energiegemeinschaften.gv.at/aenderungen-fuer-bestehende-energiegemeinschaften/",
            },
            {
                question: "Muss ich als Mitglied etwas tun?",
                answer: "Nein. Ihre Teilnahme läuft unverändert weiter und Ihr Stromliefervertrag bleibt aufrecht. Neu sind vor allem zusätzliche Informationsrechte für Mitglieder, etwa ein Informationsblatt und transparente Lieferbedingungen, die wir rechtzeitig bereitstellen.",
            },
            {
                question:
                    "Bleibt meine Teilnahme an der Energiegemeinschaft bestehen?",
                answer: "Ja. Bestehende Energiegemeinschaften werden ohne Unterbrechung in das neue Recht übergeführt. Alle Details zu den Änderungen und unseren Vorbereitungen finden Sie auf unserer Infoseite zum ElWG.",
                link: "/elwg",
                linkLabel: "Zur ElWG-Infoseite",
            },
        ],
    },
];
