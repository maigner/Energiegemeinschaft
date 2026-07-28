from django.contrib import admin

from .models import EnergyForecast
from .models import EnergyForecastRun
from .models import MeterCode
from .models import Measurement

admin.site.register(MeterCode)
admin.site.register(Measurement)


@admin.register(EnergyForecastRun)
class EnergyForecastRunAdmin(admin.ModelAdmin):
    list_display = ("created_at", "data_until", "horizon_start", "horizon_end", "model_version")
    list_filter = ("model_version",)


@admin.register(EnergyForecast)
class EnergyForecastAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "run", "consumption_kwh", "generation_kwh", "self_coverage_kwh")
    list_filter = ("run",)
    date_hierarchy = "timestamp"
