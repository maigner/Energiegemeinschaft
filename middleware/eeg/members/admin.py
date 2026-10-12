from django.contrib import admin

# Register your models here.
from django.contrib import admin

from .models import Member
from .models import BoardApproval
from .models import MemberApprovalTask
from .models import MeasurementPoint
from .models import OpenhabStatus
from .models import MembershipApplication
from .models import MemberTombstone
from .models import MemberDataAccessLog
from .models import Consent
from .models import TransformerStation
from .models import EnergyReportLog

admin.site.register(Member)
admin.site.register(MeasurementPoint)
admin.site.register(BoardApproval)
admin.site.register(MemberApprovalTask)


# Token und Provisionierungs-Code sind Zugangsdaten der Anlage, die
# verschluesselten Felder nur Chiffrat - im Admin nicht editierbar und die
# Zugangsdaten nicht lesbar (Security-Audit 2026-10-11).
@admin.register(OpenhabStatus)
class OpenhabStatusAdmin(admin.ModelAdmin):
    list_display = ('id', 'member', 'name', 'setup_phase', 'last_seen')
    exclude = ('token', 'provision_code')
    readonly_fields = ('cloud_secret', 'cloud_password', 'linux_password',
                       'inverter_password', 'wifi_password', 'data')
admin.site.register(MembershipApplication)
admin.site.register(MemberTombstone)
admin.site.register(MemberDataAccessLog)
admin.site.register(Consent)
admin.site.register(TransformerStation)
admin.site.register(EnergyReportLog)
