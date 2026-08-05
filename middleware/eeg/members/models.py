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