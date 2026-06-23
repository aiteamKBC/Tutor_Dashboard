from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0005_ticketnote'),
    ]

    operations = [
        migrations.CreateModel(
            name='TicketAction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action_type', models.CharField(choices=[('contact_coach_tutor', 'Contact Coach / Tutor'), ('request_more_information', 'Request More Information'), ('change_risk_level', 'Change Risk Level')], max_length=50)),
                ('details', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('ticket', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='actions', to='tickets.ticket')),
            ],
            options={
                'db_table': 'tutor_ticket_actions',
                'ordering': ['-created_at'],
            },
        ),
    ]
