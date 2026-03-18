from django.urls import path
from .views import EvidenceViewSet

urlpatterns = [
    path('', EvidenceViewSet.as_view({'get': 'list'}), name='evidence-list'),
    path('upload', EvidenceViewSet.as_view({'post': 'create'}), name='evidence-upload'),
    path('<int:pk>', EvidenceViewSet.as_view({'patch': 'partial_update'}), name='evidence-update'),
]
