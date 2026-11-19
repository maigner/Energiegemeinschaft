from django.contrib import admin

from .models import Fail2banBan


@admin.register(Fail2banBan)
class Fail2banBanAdmin(admin.ModelAdmin):
    list_display = ('banned_at', 'jail', 'ip', 'country_code', 'city', 'as_org')
    list_filter = ('jail', 'country_code')
    ordering = ('-banned_at',)
