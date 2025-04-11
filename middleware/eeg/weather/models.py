from django.db import models

# Create your models here.

class HistoricWeatherData(models.Model):
    timestamp = models.DateTimeField()
    temperature_2m = models.FloatField(help_text="Temperature at 2 meters (°C)")
    cloud_cover = models.FloatField(help_text="Total cloud cover (%)")
    direct_radiation = models.FloatField(help_text="Direct radiation (W/m²)")
    rain = models.FloatField(help_text="Rain (mm)")
    snowfall = models.FloatField(help_text="Snowfall (cm)")
    cloud_cover_low = models.FloatField(help_text="Low-level cloud cover (%)")
    cloud_cover_mid = models.FloatField(help_text="Mid-level cloud cover (%)")
    cloud_cover_high = models.FloatField(help_text="High-level cloud cover (%)")

    def __str__(self):
        return f"Weather at {self.timestamp.strftime('%Y-%m-%d %H:%M')}"