from rest_framework import serializers
from .models import Session

class SessionSerializer(serializers.ModelSerializer):
    criteria_status = serializers.CharField(read_only=True)
    evidence_count = serializers.IntegerField(read_only=True)
    evidence_status = serializers.CharField(read_only=True)
    
    class Meta:
        model = Session
        fields = ['id', 'group_id', 'module_id', 'doctor_id', 'subject', 
                  'session_date', 'duration_minutes', 'met_count', 'partial_count', 
                  'not_met_count', 'criteria_status', 'evidence_count', 
                  'evidence_status', 'created_at', 'updated_at']
