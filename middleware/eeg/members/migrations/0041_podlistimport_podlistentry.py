# Zaehlpunktliste (Podlist) von Netz OOe, die EEG-Faktura nach einer
# Anforderung per Mail schickt: die Website liest sie aus dem Postfach
# info@ischlstrom.org und speichert jede Lieferung mit ihren Zeilen
# (website: src/lib/server/podlist/). Grundlage fuer den Vergleich der
# Aktivierungsfenster vor der Abrechnung (docs/eegfaktura-pruefung-automatisierung.md).

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0040_openhabcountersnapshot_battery_grid_delta_kwh'),
    ]

    operations = [
        migrations.CreateModel(
            name='PodlistImport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('received_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('requested_at', models.DateTimeField(blank=True, null=True)),
                ('source', models.CharField(max_length=20)),
                ('file_name', models.CharField(blank=True, default='', max_length=200)),
                ('message_id', models.CharField(blank=True, max_length=500, null=True, unique=True)),
                ('row_count', models.IntegerField(default=0)),
                ('unknown_count', models.IntegerField(default=0)),
                ('status', models.CharField(max_length=20)),
                ('error', models.TextField(blank=True, default='')),
                ('nextcloud_path', models.CharField(blank=True, default='', max_length=500)),
            ],
            options={
                'ordering': ['-received_at'],
            },
        ),
        migrations.CreateModel(
            name='PodlistEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('row_no', models.IntegerField()),
                ('identifier', models.CharField(db_index=True, max_length=200)),
                ('direction', models.CharField(max_length=20)),
                ('participation_factor', models.SmallIntegerField()),
                ('activated', models.DateField()),
                ('active_since', models.DateField()),
                ('active_until', models.DateField(blank=True, null=True)),
                ('podlist_import', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='entries', to='members.podlistimport')),
            ],
        ),
    ]
