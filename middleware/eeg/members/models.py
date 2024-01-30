from django.db import models

# Create your models here.

class Member(models.Model):
    identifier = models.IntegerField(unique=True)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=200)
    def __str__(self):
        return f"{self.identifier}: {self.email}"


class MeasurementPoint(models.Model):
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    identifier = models.CharField(max_length=200)
    type=models.CharField(max_length=200)
    def __str__(self):
        return f"{self.identifier}"