from rest_framework import serializers
from .models import Evidence

class EvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidence
        fields = ['id', 'session_id', 'uploaded_by', 'file', 'url', 
                  'status', 'notes', 'created_at', 'reviewed_at']
        read_only_fields = ['uploaded_by', 'created_at']

class EvidenceUploadSerializer(serializers.ModelSerializer):
    session_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = Evidence
        fields = ['session_id', 'file', 'url']
    
    def create(self, validated_data):
        validated_data['uploaded_by'] = self.context['request'].user
        return super().create(validated_data)
