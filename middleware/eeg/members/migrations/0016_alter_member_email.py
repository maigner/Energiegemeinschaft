# Generated by Django 5.0.1 on 2024-07-02 07:42

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0015_member_city_member_hnr_member_latitude_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='member',
            name='email',
            field=models.EmailField(max_length=254),
        ),
    ]