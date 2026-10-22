from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from . import views


class SessionOwnershipTests(SimpleTestCase):
    def setUp(self):
        self.doctors = {
            1: 'Omar Elshafey',
            2: 'Sharon Shields',
            3: 'Keith Rowland',
            4: 'Nathan Shields',
        }
        self.covered_row = {
            'session_id': 'ai-marketing-2026-10-06',
            'date': '2026-10-06',
            'subject': 'AI In Marketing',
            'lms_module': 'AI In Marketing',
            'trainer': 'Omar Elshafey',
            'duration': '2 hours 4 minutes',
            'cancelled_session': False,
            'met_count': 8,
            'partial_count': 2,
            'not_met_count': 0,
        }
        self.rows = [self.covered_row] + [
            {
                **self.covered_row,
                'session_id': f'ai-marketing-2026-10-{day}',
                'date': f'2026-10-{day}',
                'trainer': 'Sharon Shields',
            }
            for day in ('09', '13', '14', '16', '20', '21')
        ]
        views._TUTOR_DASHBOARD_CACHE.clear()
        self.addCleanup(views._TUTOR_DASHBOARD_CACHE.clear)
        for name, value in (
            ('_load_dashboard_doctor_names', self.doctors),
            ('_load_all_qa_session_rows', self.rows),
            ('_load_checklist_map', {}),
            ('_load_attendance_presence_by_student_date', {}),
        ):
            mock = patch.object(views, name, return_value=value)
            mock.start()
            self.addCleanup(mock.stop)
        self.factory = APIRequestFactory()

    def dashboard(self, doctor_id, **filters):
        response = views.get_dashboard_data(
            self.factory.get('/api/tutor/dashboard', {'doctor_id': doctor_id, **filters})
        )
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_covered_session_keeps_sharon_as_owner(self):
        self.assertEqual(
            views._infer_row_owner_doctor(self.covered_row, list(self.doctors.values())),
            'Sharon Shields',
        )

    def test_subject_mapping_normalizes_case_and_whitespace(self):
        row = {**self.covered_row, 'subject': '  AI   in MARKETING ', 'lms_module': ''}
        self.assertEqual(
            views._infer_row_owner_doctor(row, list(self.doctors.values())),
            'Sharon Shields',
        )

    def test_lms_module_can_identify_the_owner(self):
        row = {**self.covered_row, 'subject': 'Introduction to AI'}
        self.assertEqual(
            views._infer_row_owner_doctor(row, list(self.doctors.values())),
            'Sharon Shields',
        )

    def test_owner_uses_current_doctor_display_name(self):
        names = ['Omar Elshafey', 'Nathan Shields', 'Dr. Sharon Shields']
        self.assertEqual(
            views._infer_row_owner_doctor(self.covered_row, names),
            'Dr. Sharon Shields',
        )

    def test_explicitly_named_other_cohort_keeps_its_owner(self):
        row = {**self.covered_row, 'subject': 'Keith - AI in Marketing | Friday | May 2025'}
        self.assertEqual(
            views._infer_row_owner_doctor(row, list(self.doctors.values())),
            'Keith Rowland',
        )

    def test_similar_unmapped_subject_keeps_trainer_fallback(self):
        row = {**self.covered_row, 'subject': 'AI In Marketing Advanced', 'lms_module': ''}
        self.assertEqual(
            views._infer_row_owner_doctor(row, list(self.doctors.values())),
            'Omar Elshafey',
        )

    def test_sharon_dashboard_marks_only_omars_session_as_covered(self):
        data = self.dashboard(2)
        self.assertEqual(len(data['sessions']), 7)
        covered = [row for row in data['sessions'] if row['is_covered_session']]
        self.assertEqual(len(covered), 1)
        self.assertEqual(covered[0]['session_date'], '2026-10-06')
        self.assertEqual(covered[0]['owner_doctor'], 'Sharon Shields')
        self.assertEqual(covered[0]['covered_by'], 'Omar Elshafey')
        self.assertEqual(len([row for row in data['sessions'] if not row['is_covered_session']]), 6)

    def test_omar_dashboard_contains_only_the_session_he_delivered(self):
        data = self.dashboard(1)
        self.assertEqual(len(data['sessions']), 1)
        self.assertEqual(data['sessions'][0]['owner_doctor'], 'Sharon Shields')
        self.assertEqual(data['sessions'][0]['covered_by'], 'Omar Elshafey')

    def test_coverage_survives_date_and_group_filters(self):
        data = self.dashboard(2, group_id=1, date_from='2026-10-06', date_to='2026-10-06')
        self.assertEqual(len(data['sessions']), 1)
        self.assertTrue(data['sessions'][0]['is_covered_session'])
        self.assertEqual(data['sessions'][0]['covered_by'], 'Omar Elshafey')

    def test_short_undelivered_session_is_not_marked_as_coverage(self):
        self.covered_row['duration'] = '4 minutes'
        data = self.dashboard(2, date_to='2026-10-06')
        self.assertEqual(len(data['sessions']), 1)
        self.assertFalse(data['sessions'][0]['is_covered_session'])

    def test_summary_attributes_observations_to_the_delivering_tutor(self):
        response = views.get_tutors_summary(self.factory.get('/api/tutor/summary'))
        self.assertEqual(response.status_code, 200)
        counts = {row['name']: row['sessions_count'] for row in response.data['trainers']}
        self.assertEqual(counts, {'Sharon Shields': 6, 'Omar Elshafey': 1})
        self.assertEqual(response.data['totals']['matched_sessions'], 7)

    def test_shared_subject_does_not_include_another_tutors_sessions(self):
        self.rows[:] = [
            {**self.covered_row, 'session_id': 'omar', 'subject': 'Shared Module', 'lms_module': 'Shared Module'},
            {**self.covered_row, 'session_id': 'keith', 'subject': 'Shared Module', 'lms_module': 'Shared Module', 'trainer': 'Keith Rowland'},
        ]
        for doctor_id, session_id in ((1, 'omar'), (3, 'keith')):
            for filters in ({}, {'group_id': 1}):
                with self.subTest(doctor_id=doctor_id, filters=filters):
                    data = self.dashboard(doctor_id, **filters)
                    self.assertEqual([row['id'] for row in data['sessions']], [session_id])

    def test_each_active_session_counts_for_one_tutor_and_matches_summary(self):
        self.rows.extend([
            {**self.covered_row, 'session_id': 'omar-shared', 'subject': 'Shared Module', 'lms_module': 'Shared Module'},
            {**self.covered_row, 'session_id': 'keith-shared', 'subject': 'Shared Module', 'lms_module': 'Shared Module', 'trainer': 'Keith Rowland'},
            {**self.covered_row, 'session_id': 'cancelled', 'cancelled_session': True, 'duration': '0 minutes', 'trainer': 'Sharon Shields'},
        ])
        counted_by = {}
        dashboard_counts = {}
        for doctor_id, doctor_name in self.doctors.items():
            sessions = self.dashboard(doctor_id)['sessions']
            counted = [row for row in sessions if not row['cancelled_session'] and row['effective_doctor'] == doctor_name]
            dashboard_counts[doctor_name] = len(counted)
            for row in counted:
                counted_by.setdefault(row['id'], []).append(doctor_name)

        self.assertEqual(set(counted_by), {row['session_id'] for row in self.rows if not row['cancelled_session']})
        self.assertTrue(all(len(names) == 1 for names in counted_by.values()))
        self.assertEqual(counted_by[self.covered_row['session_id']], ['Omar Elshafey'])
        summary = views.get_tutors_summary(self.factory.get('/api/tutor/summary')).data
        summary_counts = {row['name']: row['sessions_count'] for row in summary['trainers']}
        self.assertEqual({name: count for name, count in dashboard_counts.items() if count}, summary_counts)
