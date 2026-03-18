from django.urls import path
from .views import SessionViewSet

urlpatterns = [
    path('sessions', SessionViewSet.as_view({'get': 'list'}), name='sessions-list'),
]
