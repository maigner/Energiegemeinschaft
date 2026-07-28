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
    timestamp = models.DateTimeField(db_index=True)
    value = models.DecimalField(max_digits=19, decimal_places=10)
    def __str__(self):
        return f"{self.meter_code}: {self.value}"

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['measurement_point', 'meter_code', 'timestamp'], name='unique_measurement'),
        ]


class EnergyForecastRun(models.Model):
    """Ein Prognoselauf (notebooks/forecast/eeg_forecast.py).

    Jeder Lauf wird eigenständig gespeichert und nie überschrieben. Nur so lässt
    sich später vergleichen, was die Prognose gesagt hat, bevor die echten Daten
    aus dem EEG-Faktura-Export da waren.
    """

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    model_version = models.CharField(max_length=50)
    # letzter Tag, für den beim Rechnen vollständige Messdaten vorlagen
    data_until = models.DateField()
    horizon_start = models.DateTimeField()
    horizon_end = models.DateTimeField()
    training_intervals = models.IntegerField(default=0)
    # Hyperparameter und Niveaukorrekturen des Laufs, zur Nachvollziehbarkeit
    parameters = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Prognose vom {self.created_at:%d.%m.%Y %H:%M} (Daten bis {self.data_until})"


class EnergyForecast(models.Model):
    """15-Minuten-Prognose der Gemeinschaftssummen für einen Lauf."""

    run = models.ForeignKey(EnergyForecastRun, on_delete=models.CASCADE, related_name="values")
    timestamp = models.DateTimeField(db_index=True)

    consumption_kwh = models.FloatField()
    consumption_kwh_p10 = models.FloatField(null=True)
    consumption_kwh_p90 = models.FloatField(null=True)

    generation_kwh = models.FloatField()
    generation_kwh_p10 = models.FloatField(null=True)
    generation_kwh_p90 = models.FloatField(null=True)

    self_coverage_kwh = models.FloatField()
    self_coverage_kwh_p10 = models.FloatField(null=True)
    self_coverage_kwh_p90 = models.FloatField(null=True)

    surplus_kwh = models.FloatField()
    surplus_kwh_p10 = models.FloatField(null=True)
    surplus_kwh_p90 = models.FloatField(null=True)

    # Zählpunktanzahl, mit der die Prognose je Zählpunkt hochskaliert wurde
    n_consumption_points = models.IntegerField()
    n_generation_points = models.IntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["run", "timestamp"], name="unique_forecast_value"),
        ]

    def __str__(self):
        return f"{self.timestamp}: {self.consumption_kwh:.1f} kWh"
    
    
    