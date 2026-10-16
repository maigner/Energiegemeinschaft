# Tagesenergie des Batterie-Einspeisezaehlers als Summe der plausiblen
# Zuwaechse zwischen den Status-Pushes (website: batteryGridFeedInSql.js).
# Bisher rechnete die Website Tagesendstand minus Vortag und wertete einen
# Rueckgang als Reset auf 0 - ein aus dem zram wiederhergestellter Altstand
# (pi-020, 2026-10-09) ging so als 12 kWh in die Summen ein. NULL fuer
# Tage vor dieser Migration, der Cron rollupOpenhabCounterSnapshots traegt
# das Delta nach, solange die History den Tag noch abdeckt.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0039_openhabstatus_provision_redemptions'),
    ]

    operations = [
        migrations.AddField(
            model_name='openhabcountersnapshot',
            name='battery_grid_delta_kwh',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
