# Generated by Django 5.0.1 on 2024-04-26 20:13

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0013_memberapprovaltask_date_time'),
    ]

    operations = [
        migrations.AddField(
            model_name='boardapproval',
            name='new_member_email',
            field=models.EmailField(max_length=254, null=True),
        ),
    ]
