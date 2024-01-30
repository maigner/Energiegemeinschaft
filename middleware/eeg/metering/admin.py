from django.contrib import admin

# Register your models here.
# Register your models here.
from django.contrib import admin

from .models import MeterCode
from .models import Measurement

admin.site.register(MeterCode)
admin.site.register(Measurement)