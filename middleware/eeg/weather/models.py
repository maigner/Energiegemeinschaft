from django.db import models

# Create your models here.
    
    
class WeatherData(models.Model):
    time = models.DateTimeField(primary_key=True)
    temperature_2m = models.FloatField(help_text="°C")
    cloud_cover = models.FloatField(help_text="%")
    rain = models.FloatField(help_text="mm")
    snowfall = models.FloatField(help_text="cm")
    snow_depth = models.FloatField(help_text="m")

    cloud_cover_low = models.FloatField(help_text="%")
    cloud_cover_mid = models.FloatField(help_text="%")
    cloud_cover_high = models.FloatField(help_text="%")

    relative_humidity_2m = models.FloatField(help_text="%")
    dew_point_2m = models.FloatField(help_text="°C")

    def __str__(self):
        return f"Weather at {self.time}"