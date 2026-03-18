from django.urls import path
from .views import AcademicsViewSet

urlpatterns = [
    path('modules', AcademicsViewSet.as_view({'get': 'modules'}), name='modules-list'),
    path('groups/<int:pk>/students', AcademicsViewSet.as_view({'get': 'group_students'}), name='group-students'),
]
