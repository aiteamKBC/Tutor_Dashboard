from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q
from .models import Session
from .serializers import SessionSerializer
from accounts.models import DoctorProfile

class SessionViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    
    def list(self, request):
        """Get sessions for current doctor with filters"""
        try:
            profile = DoctorProfile.objects.get(user=request.user)
        except DoctorProfile.DoesNotExist:
            return Response({'error': 'Doctor profile not found'}, status=status.HTTP_404_NOT_FOUND)
        
        sessions = Session.objects.filter(doctor=profile)
        
        # Apply filters
        module_id = request.query_params.get('module_id')
        group_id = request.query_params.get('group_id')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        status_filter = request.query_params.get('status')
        
        if module_id:
            sessions = sessions.filter(module_id=module_id)
        if group_id:
            sessions = sessions.filter(group_id=group_id)
        if date_from:
            sessions = sessions.filter(session_date__gte=date_from)
        if date_to:
            sessions = sessions.filter(session_date__lte=date_to)
        
        # Annotate with evidence counts
        sessions = sessions.annotate(
            evidence_count=Count('evidence')
        )
        
        sessions_data = []
        for session in sessions:
            # Calculate evidence status
            evidence_status = 'pending'
            if session.evidence_count > 0:
                approved_count = session.evidence.filter(status='approved').count()
                if approved_count == session.evidence_count:
                    evidence_status = 'approved'
                elif session.evidence.filter(status='rejected').exists():
                    evidence_status = 'rejected'
            
            session_dict = {
                'id': str(session.id),
                'group_id': str(session.group_id),
                'module_id': str(session.module_id),
                'doctor_id': str(session.doctor_id),
                'subject': session.subject,
                'session_date': session.session_date.isoformat(),
                'duration_minutes': session.duration_minutes,
                'met_count': session.met_count,
                'partial_count': session.partial_count,
                'not_met_count': session.not_met_count,
                'criteria_status': session.criteria_status,
                'evidence_count': session.evidence_count,
                'evidence_status': evidence_status,
                'created_at': session.created_at.isoformat(),
                'updated_at': session.updated_at.isoformat(),
            }
            
            # Apply status filter
            if status_filter and session.criteria_status != status_filter:
                continue
            
            sessions_data.append(session_dict)
        
        return Response({'results': sessions_data})
