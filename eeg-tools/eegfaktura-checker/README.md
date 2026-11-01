


# Nützliches in der Shell
## Wenn man einfach nur die Tage und ZP-Nummern für die Nachforderung braucht

mit sed die Zeit entferenen, mit cut die Spalten wählen, mit sort gruppieren.

eegfaktura-checker csc Energy-Report.xlsx | sed 's/\([0-9-]*\) [0-9:]*/\1/' | cut -f1,2,5 | sort -u
