# Pruefprotokoll der Abrechnungspruefung je Zeitraum
# (docs/eegfaktura-pruefung-automatisierung.md, Stufe 2).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('metering', '0006_measurement_quality'),
    ]

    operations = [
        migrations.CreateModel(
            name='BillingCheck',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period_start', models.DateField()),
                ('period_end', models.DateField()),
                ('checked_at', models.DateTimeField()),
                ('findings_hash', models.CharField(blank=True, default='', max_length=64)),
                ('summary', models.JSONField(blank=True, null=True)),
                ('billed_at', models.DateTimeField(blank=True, null=True)),
                ('notified_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'ordering': ['-period_start'],
                'constraints': [models.UniqueConstraint(fields=('period_start', 'period_end'), name='unique_billingcheck_period')],
            },
        ),
    ]
