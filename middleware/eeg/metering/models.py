from django.db import models

from members.models import MeasurementPoint
from members.models import Member


# Create your models here.

#class Member(models.Model):
#    identifier = models.IntegerField(unique=True)
#    email = models.EmailField(unique=True)
#    def __str__(self):
#        return f"{self.identifier}: {self.email}"


#class MeasurementPoint(models.Model):
#    member = models.ForeignKey(Member, on_delete=models.CASCADE)
#    identifier = models.CharField(max_length=200)
#    type=models.CharField(max_length=200)
#    def __str__(self):
#        return f"{self.identifier}"

class MeterCode(models.Model):
    description = models.CharField(max_length=200)
    unit = models.CharField(max_length=20)

    def __str__(self):
        return f"{self.description} [{self.unit}]"
    

class Measurement(models.Model):
    measurement_point = models.ForeignKey(MeasurementPoint, on_delete=models.CASCADE)
    meter_code = models.ForeignKey(MeterCode, on_delete=models.CASCADE)
    timestamp = models.DateTimeField()
    value = models.DecimalField(max_digits=19, decimal_places=10)
    def __str__(self):
        return f"{self.meter_code}: {self.value}"
    
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['measurement_point', 'meter_code', 'timestamp'], name='unique_measurement'),
        ]
    
    
    