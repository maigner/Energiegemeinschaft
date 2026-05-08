from django.contrib import admin

# Register your models here.
from django.contrib import admin

from .models import Member
from .models import BoardApproval
from .models import MemberApprovalTask
from .models import MeasurementPoint
from .models import OpenhabDb

admin.site.register(Member)
admin.site.register(MeasurementPoint)
admin.site.register(BoardApproval)
admin.site.register(MemberApprovalTask)
admin.site.register(OpenhabDb)
