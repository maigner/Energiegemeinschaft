# Systemalarme fuer IBM-Anlagen (SD-Karte, CPU-Temperatur, RAM, Swap):
# je Kennzahl der Zeitpunkt, seit dem der Vorstand per Signal alarmiert ist
# (Website-Cron checkSystemAlerts); die Entwarnung entfernt den Eintrag.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0036_energy_report'),
    ]

    operations = [
        migrations.AddField(
            model_name='openhabstatus',
            name='system_alerts',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
