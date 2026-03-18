from django.db import models
from accounts.models import DoctorProfile
from academics.models import Module, Group

class Session(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='sessions')
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='sessions')
    doctor = models.ForeignKey(DoctorProfile, on_delete=models.CASCADE, related_name='sessions')
    subject = models.CharField(max_length=300)
    session_date = models.DateTimeField()
    duration_minutes = models.IntegerField()
    met_count = models.IntegerField(default=0)
    partial_count = models.IntegerField(default=0)
    not_met_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    @property
    def criteria_status(self):
        if self.met_count == 12:
            return "Fully Achieved"
        elif 9 <= self.met_count <= 11:
            return "Partially Achieved"
        else:
            return "Needs Improvement"
    
    def __str__(self):
        return f"{self.subject} - {self.session_date.date()}"
    
    class Meta:
        db_table = 'sessions'
        ordering = ['-session_date']
        indexes = [
            models.Index(fields=['doctor', 'session_date']),
            models.Index(fields=['group', 'session_date']),
        ]
