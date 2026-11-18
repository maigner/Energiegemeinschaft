# Vermerk je Kalendermonat, wann er zuletzt komplett aus dem Energystore
# geholt wurde; Voraussetzung fuer den Versand des Energieberichts.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('metering', '0007_billingcheck'),
    ]

    operations = [
        migrations.CreateModel(
            name='MonthImport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField(unique=True)),
                ('imported_at', models.DateTimeField()),
            ],
            options={
                'ordering': ['-month'],
            },
        ),
    ]
