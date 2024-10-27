from django.db import models

# Create your models here.

class Member(models.Model):
    identifier = models.IntegerField(unique=True)
    email = models.EmailField(unique=False)
    name = models.CharField(max_length=200)
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
    def __str__(self):
        return f"{self.identifier}"
    
    
class EventRegistration(models.Model):
    email = models.EmailField(unique=False)
    event_name = models.CharField(max_length=200)
    date_time = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"{self.email} {self.event_name}"