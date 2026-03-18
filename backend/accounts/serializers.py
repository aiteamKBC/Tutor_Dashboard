from rest_framework import serializers
from .models import User, DoctorProfile

class DoctorProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    
    class Meta:
        model = DoctorProfile
        fields = ['id', 'display_name', 'title', 'email']
