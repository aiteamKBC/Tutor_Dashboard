from django.db import models


class KbcUserData(models.Model):
    # Table: public.kbc_users_data
    id = models.BigAutoField(primary_key=True, db_column='ID')
    full_name = models.TextField(db_column='FullName', blank=True, null=True)
    email = models.TextField(db_column='Email', blank=True, null=True)
    minimum = models.DecimalField(db_column='Minimum', max_digits=12, decimal_places=2, blank=True, null=True)
    planned = models.DecimalField(db_column='Planned', max_digits=12, decimal_places=2, blank=True, null=True)
    submitted = models.DecimalField(db_column='Submitted', max_digits=12, decimal_places=2, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'kbc_users_data'
