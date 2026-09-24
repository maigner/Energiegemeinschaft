# Letzter WireGuard-Handshake je IBM-Anlage (vom s1-Timer ibm-provision-sync
# aus `wg show wg0 latest-handshakes` gestempelt) fuer die Tunnel-Spalte der
# Flotten-Gesundheitsseite /board/openhab/health.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0037_openhabstatus_system_alerts'),
    ]

    operations = [
        migrations.AddField(
            model_name='openhabstatus',
            name='wg_handshake_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
