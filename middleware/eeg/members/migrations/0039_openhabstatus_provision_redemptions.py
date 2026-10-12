# Zaehler, wie oft der aktuelle Provisionierungs-Code eingeloest wurde
# (POST /api/ibm/provision/v1): mehr als einmal bedeutet Pi-Neustart
# waehrend der Einrichtung oder eine fremde SD-Karte; das Dashboard zeigt es,
# die Website meldet es per Signal. "Neuer Code" setzt auf 0 zurueck.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0038_openhabstatus_wg_handshake_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='openhabstatus',
            name='provision_redemptions',
            field=models.IntegerField(default=0),
        ),
    ]
