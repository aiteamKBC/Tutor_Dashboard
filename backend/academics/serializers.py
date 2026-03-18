from rest_framework import serializers
from .models import Module, Group, Student

class GroupSerializer(serializers.ModelSerializer):
    students_count = serializers.IntegerField(read_only=True)
    total_sessions = serializers.IntegerField(read_only=True)
    achieved_sessions = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Group
        fields = ['id', 'name', 'module_id', 'doctor_id', 'start_date', 'end_date', 
                  'students_count', 'total_sessions', 'achieved_sessions']

class ModuleSerializer(serializers.ModelSerializer):
    groups = GroupSerializer(many=True, read_only=True)
    
    class Meta:
        model = Module
        fields = ['id', 'name', 'code', 'groups']

class StudentSerializer(serializers.ModelSerializer):
    attendance_rate = serializers.IntegerField(read_only=True)
    evidence_status = serializers.CharField(read_only=True)
    
    class Meta:
        model = Student
        fields = ['id', 'full_name', 'email', 'group_id', 'active', 
                  'attendance_rate', 'evidence_status']
