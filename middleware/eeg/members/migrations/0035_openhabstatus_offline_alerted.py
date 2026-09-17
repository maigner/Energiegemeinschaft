# Offline-Alarm fuer IBM-Anlagen: wann der Vorstand ueber eine verstummte
# Anlage benachrichtigt wurde (Website-Cron); die naechste Statusmeldung
# des Pi leert die Spalte wieder.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0034_transformerstation'),
    ]

    operations = [
        migrations.AddField(
            model_name='openhabstatus',
            name='offline_alerted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
