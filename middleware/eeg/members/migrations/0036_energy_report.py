# Monatlicher Energiebericht: Abmelde-Schalter je Mitglied und
# Versandprotokoll (Website-Cron, lib/server/mail/reports/).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0035_openhabstatus_offline_alerted'),
    ]

    operations = [
        migrations.AddField(
            model_name='member',
            name='energy_report',
            field=models.BooleanField(db_default=True, default=True),
        ),
        migrations.CreateModel(
            name='EnergyReportLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField()),
                ('email', models.EmailField(max_length=254)),
                ('sent_at', models.DateTimeField()),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='members.member')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('member', 'month'), name='unique_energy_report')],
            },
        ),
    ]
