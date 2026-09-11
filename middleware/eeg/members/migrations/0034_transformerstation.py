# Trafostation je Mitglied (normalisiert: Station einmal, Mitglieder referenzieren sie)

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0033_openhabcountersnapshot'),
    ]

    operations = [
        migrations.CreateModel(
            name='TransformerStation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('identifier', models.CharField(max_length=10, unique=True)),
                ('name', models.CharField(max_length=100)),
            ],
            options={
                'ordering': ['identifier'],
            },
        ),
        migrations.AddField(
            model_name='member',
            name='transformer_station',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='members', to='members.transformerstation'),
        ),
    ]
