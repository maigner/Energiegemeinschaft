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

    # Radiation drives the PV forecast -- shortwave_radiation alone accounts for
    # roughly 80 % of the explanatory power of the generation model, cloud cover
    # is a poor substitute.  See notebooks/forecast/README.md.
    shortwave_radiation = models.FloatField(help_text="W/m² (Globalstrahlung)", null=True)
    direct_radiation = models.FloatField(help_text="W/m²", null=True)
    diffuse_radiation = models.FloatField(help_text="W/m²", null=True)
    direct_normal_irradiance = models.FloatField(help_text="W/m²", null=True)
    sunshine_duration = models.FloatField(help_text="s pro Stunde", null=True)

    wind_speed_10m = models.FloatField(help_text="km/h", null=True)
    precipitation = models.FloatField(help_text="mm (Regen + Schauer + Schnee)", null=True)
    apparent_temperature = models.FloatField(help_text="°C (gefühlt)", null=True)

    # AROME delivers no snow depth, only the water equivalent -- kept in its own
    # column so that `snow_depth` stays comparable across data sources.
    snow_depth_water_equivalent = models.FloatField(help_text="mm", null=True)

    def __str__(self):
        return f"Weather at {self.time}"