# Aktivierungsfenster je Zaehlpunkt aus drei Quellen fuer die
# Abrechnungspruefung (docs/eegfaktura-pruefung-automatisierung.md, Stufen 1
# und 5): Masterdata-Sheet (activated_at, deactivated_at, subscription_name;
# Website-Import), Energystore-Metadaten (store_period_begin/_end;
# eegfaktura_import.py). Die Podlist von Netz OOe liegt in
# members_podlistentry (Migration 0041).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0041_podlistimport_podlistentry'),
    ]

    operations = [
        migrations.AddField(
            model_name='measurementpoint',
            name='activated_at',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='measurementpoint',
            name='deactivated_at',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='measurementpoint',
            name='subscription_name',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='measurementpoint',
            name='store_period_begin',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='measurementpoint',
            name='store_period_end',
            field=models.DateField(blank=True, null=True),
        ),
    ]
