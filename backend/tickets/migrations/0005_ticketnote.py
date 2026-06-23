from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0004_ticket_is_archived'),
    ]

    operations = [
        migrations.CreateModel(
            name='TicketNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.TextField()),
                ('created_by', models.CharField(blank=True, max_length=200, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('ticket', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notes', to='tickets.ticket')),
            ],
            options={
                'db_table': 'tutor_ticket_notes',
                'ordering': ['-created_at'],
            },
        ),
    ]
