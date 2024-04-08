from django.contrib import admin

# Register your models here.
from django.contrib import admin

from .models import Member
from .models import BoardApproval

admin.site.register(Member)
admin.site.register(BoardApproval)