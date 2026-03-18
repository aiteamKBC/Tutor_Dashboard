from django.urls import path
from .views import DoctorViewSet

urlpatterns = [
    path('me', DoctorViewSet.as_view({'get': 'me'}), name='doctor-me'),
    path('summary', DoctorViewSet.as_view({'get': 'summary'}), name='doctor-summary'),
]
