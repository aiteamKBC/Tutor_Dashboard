from rest_framework import serializers
from .models import Ticket, TicketAction, TicketNote


class TicketSerializer(serializers.ModelSerializer):
    note_count = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = '__all__'
        read_only_fields = ['id', 'ticket_ref', 'created_at', 'updated_at']

    def get_note_count(self, obj):
        legacy_count = 1 if (obj.description or '').strip() else 0
        return legacy_count + obj.notes.count()


class TicketNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketNote
        fields = ['id', 'text', 'created_by', 'created_at']
        read_only_fields = ['id', 'created_at']


class TicketActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketAction
        fields = ['id', 'action_type', 'details', 'created_at']
        read_only_fields = ['id', 'created_at']
