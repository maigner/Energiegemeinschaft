# Jahresabschluss EEG

Dieses Verzeichnis enthält die automatisierte Generierung des Jahresabschlusses für die Erneuerbare Energie Gemeinschaft (EEG).

## Struktur

```
Jahresabschluss/
├── Abschluss.ipynb          # Haupt-Notebook (Übersicht)
├── Abschluss_2025.ipynb     # Interaktives Notebook für 2025
├── generate_2025.py        # Python-Skript zur automatischen Generierung
├── README.md               # Diese Datei
├── 2023/
│   └── 2023-01-01_2023-12-31.xlsx  # Historischer Jahresabschluss
└── 2025/
    ├── .gitignore
    └── 2025-01-01_2025-12-31.xlsx  # Aktueller Jahresabschluss
```

## Jahresabschluss 2025

Der Jahresabschluss für 2025 wurde automatisch aus der Django-Datenbank (middleware/eeg/accounting) generiert.

### Zusammenfassung

- **Anzahl Buchungen:** 69
- **Einnahmen:** 14.488,41 EUR
- **Ausgaben:** -16.507,76 EUR
- **Saldo:** -2.019,35 EUR

### Inhalte der Excel-Datei

Die generierte Excel-Datei `2025/2025-01-01_2025-12-31.xlsx` enthält folgende Sheets:

1. **Alle Buchungen** - Rohdaten aller 69 Buchungen mit allen Details
2. **Zusammenfassung** - Einnahmen, Ausgaben, Saldo
3. **Nach Partner** - Gruppierung nach Partnern mit Summen
4. **Nach Monat** - Monatliche Übersicht
5. **Nach Labels** - Gruppierung nach Kategorien (Labels)
6. **Einnahmen** - Alle Einnahmen im Detail
7. **Ausgaben** - Alle Ausgaben im Detail

### Top Partner nach Umsatz

- **Energiegemeinschaft:** 11 Buchungen, -352,80 EUR
- **Erste Bank:** 12 Buchungen, -1.315,78 EUR
- **Google Cloud EMEA Limited:** 12 Buchungen, -403,43 EUR
- **Sparkasse Salzkammergut:** 1 Buchung, 1.000,00 EUR
- **Energiesparverband Oberösterreich:** 1 Buchung, 400,00 EUR

### Top Einnahmen

1. DT: ErneuerbareEnergieGeme-f3a20440c11f: 7.703,53 EUR
2. DT: ErneuerbareEnergieGeme-5096941359dc: 3.454,66 EUR
3. DT: ErneuerbareEnergieGeme-b243e6d9de9c: 1.908,65 EUR
4. Sparkasse Salzkammergut (Werbevertrag): 1.000,00 EUR
5. Energiesparverband Oberösterreich: 400,00 EUR

### Top Ausgaben

1. DT: ErneuerbareEnergieGeme-8ebb2edbf012: -6.675,78 EUR
2. DT: ErneuerbareEnergieGeme-6443eb5ffb97: -2.752,52 EUR
3. DT: ErneuerbareEnergieGeme-45003793a1da: -2.664,63 EUR
4. DT: ErneuerbareEnergieGeme-a3ef666f8d23: -1.343,58 EUR
5. Erste Bank (Kreditkartenrechnung): -1.059,23 EUR

## Nutzung

### 1. Automatische Generierung

Führe das Python-Skript aus:

```bash
cd /home/martin/Workspace/Energiegemeinschaft/middleware/eeg
/home/martin/Workspace/Energiegemeinschaft/middleware/.venvDjango/bin/python ../../notebooks/finance/Jahresabschluss/generate_2025.py
```

Dies generiert oder aktualisiert die Excel-Datei in `notebooks/finance/Jahresabschluss/2025/`.

### 2. Interaktive Analyse

Öffne das Jupyter Notebook `Abschluss_2025.ipynb` für eine detaillierte, interaktive Analyse.

### 3. Übersicht

Das Notebook `Abschluss.ipynb` bietet eine kurze Übersicht und Links zu allen Jahresabschlüssen.

## Technische Details

### Datenquelle

Die Buchungen werden aus der Django-Datenbank gelesen:
- **Modell:** `accounting.Booking` (middleware/eeg/accounting/models.py)
- **Datenbank:** PostgreSQL über Django ORM
- **Filter:** Alle Buchungen mit `booking_date__year=2025`

### Labels

Die Buchungen sind mit folgenden Labels kategorisiert:
- Bankspesen
- Energiegemeinschaft
- Steuern
- IT
- Korrektur
- Ausgaben
- Einnahmen
- Fixkosten
- Fehlbuchung
- Reverse Charge

### Abhängigkeiten

- Python 3.12+
- Django 5.0+
- pandas
- openpyxl (für Excel-Export)
- psycopg (PostgreSQL-Adapter)

## Historische Daten

- **2023:** 2023-01-01_2023-12-31.xlsx (manuell aus George CSV Export)
- **2025:** 2025-01-01_2025-12-31.xlsx (automatisch aus Django-DB)

## Hinweise

- Die Excel-Dateien werden in `.gitignore` ausgeschlossen
- Das Skript `generate_2025.py` kann für zukünftige Jahre angepasst werden
- Die Labels können in der Django-Admin-Oberfläche verwaltet werden
