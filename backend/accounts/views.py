from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Avg, Q
from .models import DoctorProfile
from .serializers import DoctorProfileSerializer
from sessions.models import Session
from evidence.models import Evidence

class DoctorViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        """Get current doctor profile"""
        try:
            profile = DoctorProfile.objects.get(user=request.user)
            serializer = DoctorProfileSerializer(profile)
            return Response(serializer.data)
        except DoctorProfile.DoesNotExist:
            return Response({'error': 'Doctor profile not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get doctor KPI summary"""
        try:
            profile = DoctorProfile.objects.get(user=request.user)
        except DoctorProfile.DoesNotExist:
            return Response({'error': 'Doctor profile not found'}, status=status.HTTP_404_NOT_FOUND)
        
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        sessions_qs = Session.objects.filter(doctor=profile)
        
        if date_from:
            sessions_qs = sessions_qs.filter(session_date__gte=date_from)
        if date_to:
            sessions_qs = sessions_qs.filter(session_date__lte=date_to)
        
        total_sessions = sessions_qs.count()
        avg_duration = sessions_qs.aggregate(avg=Avg('duration_minutes'))['avg'] or 0
        avg_met = sessions_qs.aggregate(avg=Avg('met_count'))['avg'] or 0
        
        achieved_sessions = sessions_qs.filter(met_count=12).count()
        achieved_rate = (achieved_sessions / total_sessions * 100) if total_sessions > 0 else 0
        
        total_evidence = Evidence.objects.filter(session__doctor=profile).count()
        pending_evidence = Evidence.objects.filter(session__doctor=profile, status='pending').count()
        
        return Response({
            'total_sessions': total_sessions,
            'avg_duration': round(avg_duration, 1),
            'avg_met': round(avg_met, 1),
            'achieved_rate': round(achieved_rate, 1),
            'total_evidence': total_evidence,
            'pending_evidence': pending_evidence,
        })
