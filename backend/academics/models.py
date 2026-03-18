from django.db import models
from accounts.models import DoctorProfile

class Module(models.Model):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.code} - {self.name}" if self.code else self.name
    
    class Meta:
        db_table = 'modules'
        ordering = ['name']

class Group(models.Model):
    name = models.CharField(max_length=200)
    doctor = models.ForeignKey(DoctorProfile, on_delete=models.CASCADE, related_name='groups')
    modules = models.ManyToManyField(Module, related_name='groups')
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        db_table = 'groups'
        ordering = ['name']
        indexes = [
            models.Index(fields=['doctor', 'start_date']),
        ]

class Student(models.Model):
    full_name = models.CharField(max_length=200)
    email = models.EmailField()
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='students')
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.full_name
    
    class Meta:
        db_table = 'students'
        ordering = ['full_name']
