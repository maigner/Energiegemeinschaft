# Qualitaetskennzeichen je Messwert (qov des EEG-Faktura-Energystores), damit
# die Abrechnungspruefung L3-Werte und Luecken aus der DB lesen kann
# (docs/eegfaktura-pruefung-automatisierung.md, Stufe 1). NULL fuer Altdaten;
# notebooks/energyData/eegfaktura_import.py fuellt die Spalte ab jetzt und
# per --from/--to rueckwirkend.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('metering', '0005_energyforecastrun_energyforecast'),
    ]

    operations = [
        migrations.AddField(
            model_name='measurement',
            name='quality',
            field=models.SmallIntegerField(blank=True, null=True),
        ),
    ]
