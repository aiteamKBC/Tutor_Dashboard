from django.db import models
from accounts.models import User
from sessions.models import Session

class Evidence(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='evidence')
    uploaded_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploaded_evidence')
    file = models.FileField(upload_to='evidence/%Y/%m/%d/', blank=True, null=True)
    url = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    
    def __str__(self):
        return f"Evidence for {self.session.subject} - {self.status}"
    
    class Meta:
        db_table = 'evidence'
        ordering = ['-created_at']
        verbose_name_plural = 'Evidence'
