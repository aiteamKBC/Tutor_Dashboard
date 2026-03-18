from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils import timezone
from .models import Evidence
from .serializers import EvidenceSerializer, EvidenceUploadSerializer

class EvidenceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def get_queryset(self):
        queryset = Evidence.objects.all()
        session_id = self.request.query_params.get('session_id')
        if session_id:
            queryset = queryset.filter(session_id=session_id)
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'create':
            return EvidenceUploadSerializer
        return EvidenceSerializer
    
    def list(self, request):
        """Get evidence list"""
        queryset = self.get_queryset()
        serializer = EvidenceSerializer(queryset, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Upload evidence"""
        serializer = EvidenceUploadSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def partial_update(self, request, pk=None):
        """Update evidence status (QA/Admin only)"""
        if request.user.role not in ['qa', 'admin']:
            return Response(
                {'error': 'Only QA and Admin can review evidence'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            evidence = Evidence.objects.get(pk=pk)
        except Evidence.DoesNotExist:
            return Response({'error': 'Evidence not found'}, status=status.HTTP_404_NOT_FOUND)
        
        evidence.status = request.data.get('status', evidence.status)
        evidence.notes = request.data.get('notes', evidence.notes)
        evidence.reviewed_at = timezone.now()
        evidence.save()
        
        serializer = EvidenceSerializer(evidence)
        return Response(serializer.data)
