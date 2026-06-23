from django.db import models


class Ticket(models.Model):
    RISK_CHOICES = [('red', 'Red'), ('amber', 'Amber')]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_review', 'In Review'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]
    ISSUE_TYPE_CHOICES = [
        ('not_met', 'Not Met'),
        ('partially_met', 'Partially Met'),
        ('manual', 'Manual'),
    ]
    SOURCE_CHOICES = [('system', 'System'), ('manual', 'Manual')]

    ticket_ref = models.CharField(max_length=20, unique=True)
    tutor_name = models.CharField(max_length=200)
    session_id = models.CharField(max_length=200, blank=True, null=True)
    session_date = models.CharField(max_length=50, blank=True, null=True)
    session_subject = models.CharField(max_length=300, blank=True, null=True)
    group_name = models.CharField(max_length=200, blank=True, null=True)
    checklist_item_code = models.CharField(max_length=100, blank=True, null=True)
    checklist_item_name = models.CharField(max_length=300, blank=True, null=True)
    issue_type = models.CharField(max_length=20, choices=ISSUE_TYPE_CHOICES)
    risk = models.CharField(max_length=20, choices=RISK_CHOICES)
    evidence = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    assigned_to = models.CharField(max_length=200, blank=True, null=True)
    is_archived = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='system')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tutor_tickets'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.ticket_ref:
            import re
            last = Ticket.objects.order_by('id').last()
            if last and last.ticket_ref:
                m = re.search(r'\d+', last.ticket_ref)
                last_num = int(m.group()) if m else 0
            else:
                last_num = 0
            self.ticket_ref = f'TKT-{last_num + 1:03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.ticket_ref} - {self.tutor_name}'


class TicketEvidence(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='evidence_files')
    file = models.FileField(upload_to='ticket_evidence/')
    original_name = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tutor_ticket_evidence'
        ordering = ['-uploaded_at']


class TicketNote(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='notes')
    text = models.TextField()
    created_by = models.CharField(max_length=200, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tutor_ticket_notes'
        ordering = ['-created_at']


class TicketAction(models.Model):
    ACTION_CHOICES = [
        ('contact_coach_tutor', 'Contact Coach / Tutor'),
        ('request_more_information', 'Request More Information'),
        ('change_risk_level', 'Change Risk Level'),
    ]

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='actions')
    action_type = models.CharField(max_length=50, choices=ACTION_CHOICES)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tutor_ticket_actions'
        ordering = ['-created_at']
