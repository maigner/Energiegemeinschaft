from django.db import models
from django.db.models.functions import Now


class Fail2banBan(models.Model):
    """Eine fail2ban-Sperre auf s1 samt ungefaehrem Standort der Adresse.

    Geschrieben vom root-Timer fail2ban-geo auf s1 (scripts/fail2ban-geo/),
    der fail2bans eigene SQLite-Datenbank liest (die vergisst Sperren nach
    24 Stunden) und Land, Ort, Koordinaten und Netz aus den lokalen
    DB-IP-Lite-Dateien nachschlaegt. Gelesen von /board/security.

    ip wird nach 90 Tagen auf NULL gesetzt (Speicherbegrenzung); Standort und
    Netz bleiben fuer die Langzeit-Auswertung stehen. banned_at ist fail2bans
    timeofban, bantime_seconds -1 = dauerhaft. source: 'db' aus der
    SQLite-Datenbank, 'log' aus dem einmaligen Nachtrag der rotierten Logs.
    """
    jail = models.CharField(max_length=64)
    ip = models.GenericIPAddressField(null=True, blank=True)
    banned_at = models.DateTimeField()
    bantime_seconds = models.IntegerField(null=True, blank=True)
    ban_count = models.IntegerField(default=1, db_default=1)
    country_code = models.CharField(max_length=2, blank=True, db_default='')
    country = models.CharField(max_length=80, blank=True, db_default='')
    city = models.CharField(max_length=120, blank=True, db_default='')
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    asn = models.BigIntegerField(null=True, blank=True)
    as_org = models.CharField(max_length=200, blank=True, db_default='')
    source = models.CharField(max_length=8, default='db', db_default='db')
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['jail', 'ip', 'banned_at'], name='fail2banban_unique_ban'),
        ]
        indexes = [
            models.Index(fields=['banned_at'], name='fail2banban_banned_at'),
        ]

    def __str__(self):
        return f"{self.jail} {self.ip or 'anonymisiert'} @ {self.banned_at}"
