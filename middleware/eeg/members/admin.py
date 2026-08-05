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

admin.site.register(Member)
admin.site.register(MeasurementPoint)
admin.site.register(BoardApproval)
admin.site.register(MemberApprovalTask)
admin.site.register(OpenhabStatus)
admin.site.register(MembershipApplication)
admin.site.register(MemberTombstone)
admin.site.register(MemberDataAccessLog)
