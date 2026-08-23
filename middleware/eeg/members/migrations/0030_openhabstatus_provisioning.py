# Zero-Touch-Provisionierung der IBM-Anlagen (docs/ibm-setup-vereinfachung.md)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0029_membershipapplication_membertombstone_and_more'),
    ]

    operations = [
        migrations.AddField(model_name='openhabstatus', name='provision_code', field=models.CharField(blank=True, max_length=40, null=True, unique=True)),
        migrations.AddField(model_name='openhabstatus', name='provision_expires', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='openhabstatus', name='provisioned_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='openhabstatus', name='inverter_type', field=models.CharField(blank=True, default='', max_length=50)),
        migrations.AddField(model_name='openhabstatus', name='inverter_username', field=models.CharField(blank=True, default='', max_length=100)),
        migrations.AddField(model_name='openhabstatus', name='inverter_password', field=models.CharField(blank=True, default='', max_length=500)),
        migrations.AddField(model_name='openhabstatus', name='wg_address', field=models.CharField(blank=True, default='', max_length=20)),
        migrations.AddField(model_name='openhabstatus', name='wg_public_key', field=models.CharField(blank=True, default='', max_length=100)),
        migrations.AddField(model_name='openhabstatus', name='wg_synced_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='openhabstatus', name='cloud_uuid', field=models.CharField(blank=True, default='', max_length=64)),
        migrations.AddField(model_name='openhabstatus', name='cloud_secret', field=models.CharField(blank=True, default='', max_length=200)),
        migrations.AddField(model_name='openhabstatus', name='cloud_username', field=models.CharField(blank=True, default='', max_length=200)),
        migrations.AddField(model_name='openhabstatus', name='cloud_password', field=models.CharField(blank=True, default='', max_length=200)),
        migrations.AddField(model_name='openhabstatus', name='cloud_account_state', field=models.CharField(blank=True, default='', max_length=20)),
        migrations.AddField(model_name='openhabstatus', name='cloud_account_error', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='openhabstatus', name='mail_alias_state', field=models.CharField(blank=True, default='', max_length=200)),
        migrations.AddField(model_name='openhabstatus', name='linux_password', field=models.CharField(blank=True, default='', max_length=200)),
        migrations.AddField(model_name='openhabstatus', name='wifi_ssid', field=models.CharField(blank=True, default='', max_length=100)),
        migrations.AddField(model_name='openhabstatus', name='wifi_password', field=models.CharField(blank=True, default='', max_length=200)),
        migrations.AddField(model_name='openhabstatus', name='setup_phase', field=models.CharField(blank=True, default='', max_length=50)),
        migrations.AddField(model_name='openhabstatus', name='setup_message', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='openhabstatus', name='setup_phase_at', field=models.DateTimeField(blank=True, null=True)),
    ]
