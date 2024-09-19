from django.contrib import admin

from .models import Booking, BookingLabel

admin.site.register(Booking)
admin.site.register(BookingLabel)