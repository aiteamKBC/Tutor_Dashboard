from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_tickets, name='ticket-list'),
    path('create/', views.create_ticket, name='ticket-create'),
    path('<int:pk>/', views.ticket_detail, name='ticket-detail'),
    path('sync/', views.sync_tickets, name='ticket-sync'),
    path('sync-all/', views.sync_all_tickets, name='ticket-sync-all'),
    path('delete-by-month/', views.delete_by_month, name='ticket-delete-by-month'),
    path('count/', views.ticket_count, name='ticket-count'),
    path('evidence-counts/', views.ticket_evidence_counts, name='ticket-evidence-counts'),
    path('<int:ticket_pk>/evidence/', views.ticket_evidence_list, name='ticket-evidence-list'),
    path('<int:ticket_pk>/evidence/<int:evidence_pk>/preview/', views.ticket_evidence_preview, name='ticket-evidence-preview'),
    path('<int:ticket_pk>/evidence/<int:evidence_pk>/download/', views.ticket_evidence_download, name='ticket-evidence-download'),
    path('<int:ticket_pk>/evidence/<int:evidence_pk>/sheet-preview/', views.ticket_evidence_sheet_preview, name='ticket-evidence-sheet-preview'),
    path('<int:ticket_pk>/evidence/<int:evidence_pk>/', views.ticket_evidence_delete, name='ticket-evidence-delete'),
    path('<int:ticket_pk>/notes/', views.ticket_note_list, name='ticket-note-list'),
    path('<int:ticket_pk>/notes/<str:note_pk>/', views.ticket_note_delete, name='ticket-note-delete'),
    path('<int:ticket_pk>/actions/', views.ticket_action_list, name='ticket-action-list'),
]
