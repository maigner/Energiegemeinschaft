# Generated by Django 5.0.1 on 2024-07-04 19:15

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0016_alter_member_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='member',
            name='welcome_message_sent_at',
            field=models.DateTimeField(default=None, null=True),
        ),
    ]