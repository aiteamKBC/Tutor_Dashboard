"""Read-only reconciliation of QA records against every dashboard and group."""
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import os

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from rest_framework.test import APIRequestFactory

from tutor_dashboard import views


class Command(BaseCommand):
    help = 'Reconcile session attribution and checklist totals without changing database records.'

    def add_arguments(self, parser):
        parser.add_argument('--output', help='Optional path for a JSON audit report (no student or evidence data).')

    def handle(self, *args, **options):
        views._TUTOR_DASHBOARD_CACHE.clear()
        self.stdout.write('Reading QA sessions and checklist in a read-only database snapshot...')
        schema = os.getenv('QA_TABLE_SCHEMA', 'public')
        checklist_table = os.getenv('QA_CHECKLIST_TABLE_NAME', 'qa_doctors_checklist_items')
        quote = connection.ops.quote_name
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
                cursor.execute("SET LOCAL statement_timeout = '60s'")
                cursor.execute(f'SELECT COUNT(*) FROM {quote(schema)}.{quote(checklist_table)}')
                checklist_row_count = cursor.fetchone()[0]
            rows = views._load_all_qa_session_rows()
            checklists = views._load_checklist_map({views._session_key(row) for row in rows})

        self.stdout.write(f'Reconciling {len(rows)} sessions and {checklist_row_count} checklist rows...')
        errors = []
        factory = APIRequestFactory()
        source_active = {views._session_key(row) for row in rows if not views._as_bool(row.get('cancelled_session'))}
        all_source_ids = {views._session_key(row) for row in rows}
        visible_ids = set()
        counted_by = defaultdict(list)
        tutor_counts = []
        group_checks = 0
        target = None

        # Replay the actual GET views over the same source snapshot. Attendance
        # is outside this audit's two-table scope; no API write or ticket sync runs.
        with patch.object(views, '_load_all_qa_session_rows', return_value=rows), \
             patch.object(views, '_load_checklist_map', return_value=checklists), \
             patch.object(views, '_load_attendance_presence_by_student_date', return_value={}):
            dimensions = views._load_dashboard_doctor_dimensions()
            doctor_names, groups_by_doctor, _ = dimensions
            attributions = views._build_session_attributions(rows, list(doctor_names.values()))
            with patch.object(views, '_load_dashboard_doctor_dimensions', return_value=dimensions), \
                 patch.object(views, '_build_session_attributions', return_value=attributions):
                summary = views.get_tutors_summary(factory.get('/api/tutor/summary')).data
                summary_by_name = {tutor['name']: tutor for tutor in summary['trainers']}
                for doctor_id, doctor_name in doctor_names.items():
                    response = views.get_dashboard_data(factory.get('/api/tutor/dashboard', {'doctor_id': doctor_id}))
                    if response.status_code != 200:
                        errors.append(f'Dashboard failed for {doctor_name}')
                        continue
                    data = response.data
                    visible_ids.update(session['id'] for session in data['sessions'])
                    counted = [s for s in data['sessions'] if s['is_delivered'] and s['effective_doctor'] == doctor_name]
                    for session in counted:
                        counted_by[session['id']].append(doctor_name)
                    expected = summary_by_name.get(doctor_name, {})
                    for source_field, expected_field in [('adjusted_sessions', 'sessions_count'), ('observations', 'observations'), ('compliance_rate', 'compliance_rate')]:
                        if data['kpis'][source_field] != expected.get(expected_field, 0):
                            errors.append(f'{doctor_name}: dashboard/summary mismatch for {source_field}')
                    for field in ('met', 'partial', 'not_met'):
                        if data['charts']['totals'][field] != expected.get(field, 0):
                            errors.append(f'{doctor_name}: checklist mismatch for {field}')
                    tutor_counts.append({
                        'doctor': doctor_name, 'listed_sessions': len(data['sessions']),
                        'counted_sessions': len(counted), 'compliance_rate': data['kpis']['compliance_rate'],
                        **data['charts']['totals'],
                    })
                    for group in groups_by_doctor.get(doctor_id, []):
                        group_checks += 1
                        group_data = views.get_dashboard_data(factory.get('/api/tutor/dashboard', {
                            'doctor_id': doctor_id, 'group_id': group['id'],
                        })).data
                        group_ids = {s['id'] for s in group_data['sessions']}
                        expected_ids = {s['id'] for s in data['sessions'] if views._normalize_module_for_match(
                            views._clean_subject_for_group(s['subject'])
                        ) == views._normalize_module_for_match(group['name'])}
                        if group_ids != expected_ids:
                            errors.append(f'{doctor_name}: group mismatch for {group["name"]}')
                        if views._normalize_doctor_identity(doctor_name) == 'amgad badewi' and group['name'].lower() == 'ai in project control 2026':
                            target = {
                                'group': group['name'], **group_data['kpis'],
                                'sessions': [{key: s[key] for key in (
                                    'session_date', 'trainer', 'owner_doctor', 'effective_doctor',
                                    'cancelled_session', 'is_covered_session', 'met_count', 'partial_count', 'not_met_count',
                                )} for s in group_data['sessions']],
                            }

        duplicates = [sid for sid, names in counted_by.items() if len(names) != 1]
        missing = source_active - set(counted_by)
        unexpected = set(counted_by) - source_active
        hidden = all_source_ids - visible_ids
        if duplicates or missing or unexpected or hidden:
            errors.append('Session reconciliation failed (duplicates, missing, unexpected or hidden records).')
        report = {
            'audited_at_utc': datetime.now(timezone.utc).isoformat(),
            'scope': 'QA session visibility, attribution, groups and checklist metrics',
            'source_sessions': len(rows), 'source_checklist_rows': checklist_row_count,
            'active_sessions': len(source_active), 'cancelled_sessions': len(rows) - len(source_active),
            'counted_sessions': len(counted_by), 'visible_source_sessions': len(visible_ids),
            'group_checks': group_checks, 'duplicate_credits': len(duplicates),
            'missing_credits': len(missing), 'unexpected_credits': len(unexpected), 'hidden_sessions': len(hidden),
            'visible_checklist_sizes': dict(Counter(len(checklists.get(views._session_key(row), [])) for row in rows)),
            'cancelled_without_explicit_owner': sum(1 for item in attributions.values() if item['cancelled_session'] and not item['owner_doctor']),
            'amgad_ai_project_control': target, 'tutors': tutor_counts,
            'errors': errors, 'database_changed': False,
        }
        if options['output']:
            destination = Path(options['output'])
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        views._TUTOR_DASHBOARD_CACHE.clear()
        if errors:
            raise CommandError('; '.join(errors))
        self.stdout.write(self.style.SUCCESS(
            f'PASS: {len(source_active)} active sessions counted exactly once; '
            f'{len(visible_ids)} source sessions visible; {group_checks} group checks; no count/checklist discrepancies.'
        ))
