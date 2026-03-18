from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q
from .models import Module, Group, Student
from .serializers import ModuleSerializer, GroupSerializer, StudentSerializer
from accounts.models import DoctorProfile

class AcademicsViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def modules(self, request):
        """Get modules with groups for current doctor"""
        try:
            profile = DoctorProfile.objects.get(user=request.user)
        except DoctorProfile.DoesNotExist:
            return Response({'error': 'Doctor profile not found'}, status=status.HTTP_404_NOT_FOUND)
        
        modules = Module.objects.filter(
            groups__doctor=profile
        ).distinct().prefetch_related('groups')
        
        # Annotate groups with counts
        for module in modules:
            for group in module.groups.filter(doctor=profile):
                group.students_count = group.students.filter(active=True).count()
                group.total_sessions = group.sessions.count()
                group.achieved_sessions = group.sessions.filter(met_count=12).count()
        
        serializer = ModuleSerializer(modules, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'], url_path='students')
    def group_students(self, request, pk=None):
        """Get students in a specific group"""
        try:
            profile = DoctorProfile.objects.get(user=request.user)
            group = Group.objects.get(pk=pk, doctor=profile)
        except (DoctorProfile.DoesNotExist, Group.DoesNotExist):
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
        
        students = Student.objects.filter(group=group, active=True)
        
        students_data = []
        for student in students:
            students_data.append({
                'id': str(student.id),
                'full_name': student.full_name,
                'email': student.email,
                'group_id': str(student.group_id),
                'active': student.active,
            })
        
        return Response(students_data)
