from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0003_ticketevidence'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='is_archived',
            field=models.BooleanField(default=False),
        ),
    ]
