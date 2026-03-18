from django.urls import path
from . import views

urlpatterns = [
    path('doctors', views.get_doctors, name='get_doctors'),
    path('summary', views.get_tutors_summary, name='get_tutors_summary'),
    path('session-report', views.get_session_report, name='get_session_report'),
    path('doctors/search', views.search_doctors, name='search_doctors'),
    path('doctors/<int:doctor_id>/groups', views.get_doctor_groups, name='get_doctor_groups'),
    path('groups/<int:group_id>/modules', views.get_group_modules, name='get_group_modules'),
    path('qa-sessions', views.get_qa_sessions_by_filters, name='get_qa_sessions_by_filters'),
    path('dashboard', views.get_dashboard_data, name='get_dashboard_data'),
]
