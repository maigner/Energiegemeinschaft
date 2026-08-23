from django.db import models

# Create your models here.

class Member(models.Model):
    identifier = models.IntegerField(unique=True)
    email = models.EmailField(unique=False)
    name = models.CharField(max_length=200)
    first_name = models.CharField(max_length=200, null=True)
    last_name = models.CharField(max_length=200, null=True)
    board_member = models.BooleanField(default=False)
    street = models.CharField(max_length=200, null=True)
    hnr = models.CharField(max_length=20, null=True)
    zip = models.CharField(max_length=5, null=True)
    city = models.CharField(max_length=20, null=True)
    latitude = models.FloatField(null=True)
    longitude = models.FloatField(null=True)
    member_since = models.DateField(null=True)
    def __str__(self):
        return f"{self.identifier}: {self.email}"
    

class OpenhabStatus(models.Model):
    """Token and live status of an openHABian installation (IBM). The board
    creates the token for a member on /board/openhab; during setup it is
    stored on the pi (ibm.conf) and authenticates the status pushes of rule
    ibm_status_push.js to /api/ibm/status/v1. Deleting a row revokes the
    token."""
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    token = models.CharField(max_length=200, unique=True)
    name = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    data = models.JSONField(default=dict, blank=True)

    # --- Provisionierung (Zero-Touch-Einrichtung, seit 2026-08) ------------
    # Alles, was der Einrichtungsassistent frueher am Pi abgefragt hat,
    # entsteht beim "SD-Karte vorbereiten" auf /board/openhab und wird dem
    # Pi ueber POST /api/ibm/provision/v1 in einem Stueck geliefert. Felder
    # mit Geheimnissen (cloud_secret, cloud_password, linux_password,
    # inverter_password, wifi_password) speichert die Website verschluesselt
    # (AES-256-GCM, Schluessel IBM_SECRET_KEY in website/.env; Format
    # "enc1:<iv>:<tag>:<ciphertext>", Base64). Siehe
    # docs/ibm-setup-vereinfachung.md.
    provision_code = models.CharField(max_length=40, null=True, blank=True, unique=True)
    provision_expires = models.DateTimeField(null=True, blank=True)
    provisioned_at = models.DateTimeField(null=True, blank=True)
    # Wechselrichter-Profil (Verzeichnis unter inverters/); leer = der Pi
    # erkennt es selbst und meldet das Ergebnis zurueck.
    inverter_type = models.CharField(max_length=50, blank=True, default="")
    inverter_username = models.CharField(max_length=100, blank=True, default="")
    # Passwort am Wechselrichter (GEN24): vom Mitglied oder Vorstand
    # eingetragen, vom Pi einmal abgeholt und danach serverseitig geloescht.
    inverter_password = models.CharField(max_length=500, blank=True, default="")
    # WireGuard-Fernwartung: Tunnel-IP aus dem Pool (ab 10.88.0.11) und der
    # vom Pi gemeldete Public-Key; der Timer ibm-provision-sync auf s1
    # schreibt daraus die wg0.conf und stempelt wg_synced_at.
    wg_address = models.CharField(max_length=20, blank=True, default="")
    wg_public_key = models.CharField(max_length=100, blank=True, default="")
    wg_synced_at = models.DateTimeField(null=True, blank=True)
    # openHAB-Cloud (hac.ischlstrom.org): Identitaet der Anlage (UUID/Secret,
    # serverseitig erzeugt, vom Pi in userdata geschrieben) und das Konto
    # des Mitglieds (Alias <nnn>@ischlstrom.org). cloud_account_state:
    # '' | pending | created | reset | error; den Zustandswechsel macht der
    # s1-Timer (Konto per Skript im Cloud-Container anlegen).
    cloud_uuid = models.CharField(max_length=64, blank=True, default="")
    cloud_secret = models.CharField(max_length=200, blank=True, default="")
    cloud_username = models.CharField(max_length=200, blank=True, default="")
    cloud_password = models.CharField(max_length=200, blank=True, default="")
    cloud_account_state = models.CharField(max_length=20, blank=True, default="")
    cloud_account_error = models.TextField(blank=True, default="")
    # Mail-Alias <nnn>@ischlstrom.org -> info@ (mailcow-API):
    # '' | created | error: ... | skipped
    mail_alias_state = models.CharField(max_length=200, blank=True, default="")
    # Passwort des Linux-Benutzers openhabian und des openHAB-Admin-Kontos
    linux_password = models.CharField(max_length=200, blank=True, default="")
    # Optionales WLAN fuer die openhabian.conf der SD-Karte
    wifi_ssid = models.CharField(max_length=100, blank=True, default="")
    wifi_password = models.CharField(max_length=200, blank=True, default="")
    # Einrichtungsphase, vom Pi gemeldet (POST /api/ibm/provision/v1/result)
    setup_phase = models.CharField(max_length=50, blank=True, default="")
    setup_message = models.TextField(blank=True, default="")
    setup_phase_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "Openhab statuses"

    def __str__(self):
        return f"{self.member}: {self.name or 'ohne Namen'} (last seen {self.last_seen})"


class OpenhabStatusHistory(models.Model):
    """One row per status push of an installation, appended by the website
    (POST /api/ibm/status/v1). Feeds the charts on /board/openhab/<id>;
    rows older than 30 days are pruned by a website cron job."""
    status = models.ForeignKey(OpenhabStatus, on_delete=models.CASCADE)
    time = models.DateTimeField()
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name_plural = "Openhab status histories"
        indexes = [
            models.Index(fields=["status", "time"]),
        ]

    def __str__(self):
        return f"{self.status_id} @ {self.time}"


class BoardApproval(models.Model):
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    date_time = models.DateTimeField(auto_now_add=True)
    new_member_approved = models.CharField(max_length=200)
    new_member_email = models.EmailField(null=True)
    answer = models.CharField(max_length=200)
    def __str__(self):
        return f"{self.member} @ {self.date_time}: {self.new_member_approved}: {self.answer}"


class MemberApprovalTask(models.Model):
    date_time = models.DateTimeField()
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=200)
    address = models.CharField(max_length=200)
    def __str__(self):
        return f"{self.email}: {self.name}, {self.address}"


class MeasurementPoint(models.Model):
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    identifier = models.CharField(max_length=200, unique=True)
    type=models.CharField(max_length=20)
    status=models.CharField(max_length=20)
    welcome_message_sent_at = models.DateTimeField(null=True, default=None)
    activation_reminder_sent_at = models.DateTimeField(null=True, default=None)
    def __str__(self):
        return f"{self.identifier}"
    
    
class EventRegistration(models.Model):
    email = models.EmailField(unique=False)
    event_name = models.CharField(max_length=200)
    date_time = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"{self.email} {self.event_name}"


class MembershipApplication(models.Model):
    """Bewerbung aus dem Onboarding-Formular der Website
    (POST /api/user/onboarding). Die Website schreibt die Zeilen direkt per
    SQL; Django verwaltet nur das Schema. Die Checkbox-Werte samt created_at
    sind der Nachweis der abgegebenen Erklaerungen (Art. 7 Abs. 1 DSGVO).
    Aufbewahrung: bis zum Ende der Mitgliedschaft bzw. bei Ablehnung bis zum
    Abschluss des Verfahrens."""
    created_at = models.DateTimeField(auto_now_add=True)
    email = models.EmailField()
    applicant_type = models.CharField(max_length=20)  # "home" | "company"
    first_name = models.CharField(max_length=200, blank=True, default="")
    last_name = models.CharField(max_length=200, blank=True, default="")
    company_name = models.CharField(max_length=200, blank=True, default="")
    street = models.CharField(max_length=200)
    hnr = models.CharField(max_length=20)
    zip = models.CharField(max_length=10)
    city = models.CharField(max_length=100)
    iban = models.CharField(max_length=42)
    account_name = models.CharField(max_length=200)
    # Liste von {identifier, type}
    measurement_points = models.JSONField(default=list)
    accepted_terms = models.BooleanField(default=False)
    accepted_sepa = models.BooleanField(default=False)
    acknowledged_privacy_notice = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d} {self.email}"


class MemberTombstone(models.Model):
    """Verhindert, dass der Nextcloud-Import (Masterdata-Spreadsheet) ein
    nach Art. 17 DSGVO geloeschtes Mitglied wieder anlegt: Identifier hier
    eintragen, dann ueberspringt der Import die Zeile dauerhaft."""
    identifier = models.IntegerField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=200, blank=True, default="")

    def __str__(self):
        return f"{self.identifier} ({self.created_at:%Y-%m-%d})"


class MemberDataAccessLog(models.Model):
    """Protokolliert Zugriffe von Vorstandsmitgliedern auf Verbrauchsdaten
    fremder Mitglieder (Art. 32 DSGVO, Nachvollziehbarkeit). Geschrieben von
    der Website in canAccessMemberData; nach einem Jahr per Cron geloescht."""
    created_at = models.DateTimeField(auto_now_add=True)
    accessor_email = models.EmailField()
    member_identifier = models.IntegerField()
    endpoint = models.CharField(max_length=200)

    class Meta:
        indexes = [
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.accessor_email} -> {self.member_identifier} @ {self.created_at}"