from django.db import models

# Create your models here.

class Member(models.Model):
    identifier = models.IntegerField(unique=True)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=200)
    board_member = models.BooleanField(default=False)
    def __str__(self):
        return f"{self.identifier}: {self.email}"
    
    
class BoardApproval(models.Model):
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    date_time = models.DateTimeField(auto_now_add=True)
    new_member_approved = models.CharField(max_length=200)
    answer = models.CharField(max_length=200)
    def __str__(self):
        return f"{self.member} @ {self.date_time}: {self.new_member_approved}: {self.answer}"


class MeasurementPoint(models.Model):
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    identifier = models.CharField(max_length=200, unique=True)
    type=models.CharField(max_length=20)
    status=models.CharField(max_length=20)
    def __str__(self):
        return f"{self.identifier}"
    
    
