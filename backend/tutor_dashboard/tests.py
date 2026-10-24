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

    def group_id(self, doctor_id, name):
        groups = views._load_dashboard_doctor_dimensions()[1].get(doctor_id, [])
        return next(group['id'] for group in groups if group['name'] == name)

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
        data = self.dashboard(2, group_id=self.group_id(2, 'AI In Marketing'), date_from='2026-10-06', date_to='2026-10-06')
        self.assertEqual(len(data['sessions']), 1)
        self.assertTrue(data['sessions'][0]['is_covered_session'])
        self.assertEqual(data['sessions'][0]['covered_by'], 'Omar Elshafey')

    def test_short_session_keeps_recorded_deliverer_until_source_marks_it_undelivered(self):
        self.covered_row['duration'] = '4 minutes'
        data = self.dashboard(2, date_to='2026-10-06')
        self.assertEqual(len(data['sessions']), 1)
        self.assertTrue(data['sessions'][0]['is_covered_session'])
        self.assertEqual(data['sessions'][0]['effective_doctor'], 'Omar Elshafey')

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
            for filters in ({}, {'group_id': self.group_id(doctor_id, 'Shared Module')}):
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

    def seed_amgad_cohort(self):
        self.doctors.update({5: 'Dr. Amgad Badewi', 6: 'Jolyon'})
        self.rows[:] = [
            {**self.covered_row, 'session_id': f'amgad-{index}', 'subject': 'AI in Project Control 2026',
             'lms_module': 'AI in Project Control 2026', 'trainer': trainer, 'date': date,
             'duration': '0 minutes' if cancelled else '2 hours 5 minutes',
             'cancelled_session': cancelled, 'met_count': met, 'partial_count': partial,
             'not_met_count': 10 if cancelled else 0}
            for index, (trainer, date, cancelled, met, partial) in enumerate([
                ('Jolyon', '2026-10-23', False, 10, 0),
                ('Amgad Badewi', '2026-10-16', False, 10, 0),
                ('Amgad Badewi', '2026-10-09', False, 10, 0),
                ('Amgad Badewi', '2026-09-25', False, 9, 1),
                ('Amgad Badewi', '2026-09-18', False, 9, 1),
                ('Amgad Badewi', '2026-09-11', False, 10, 0),
                ('Session not delivered', '2026-09-04', True, 0, 0),
            ])
        ]

    def test_amgad_cohort_includes_cover_and_cancelled_row(self):
        self.seed_amgad_cohort()
        data = self.dashboard(5, group_id=self.group_id(5, 'AI in Project Control 2026'))
        self.assertEqual(data['kpis']['total_sessions'], 7)
        self.assertEqual(data['kpis']['adjusted_sessions'], 5)
        self.assertEqual(data['kpis']['compliance_rate'], 96)
        self.assertEqual(data['charts']['totals'], {'met': 48, 'partial': 2, 'not_met': 0})
        self.assertEqual(len(data['charts']['student_engagement']), 5)
        cover = data['sessions'][0]
        self.assertEqual((cover['owner_doctor'], cover['effective_doctor']), ('Dr. Amgad Badewi', 'Jolyon'))
        self.assertTrue(cover['is_covered_session'])
        cancelled = data['sessions'][-1]
        self.assertIsNone(cancelled['effective_doctor'])
        self.assertFalse(cancelled['is_covered_session'])
        self.assertTrue(cancelled['cancelled_session'])

    def test_covering_tutor_can_filter_the_same_cohort(self):
        self.seed_amgad_cohort()
        data = self.dashboard(6, group_id=self.group_id(6, 'AI in Project Control 2026'))
        self.assertEqual(len(data['sessions']), 1)
        self.assertEqual(data['kpis']['adjusted_sessions'], 1)
        self.assertEqual(data['kpis']['compliance_rate'], 100)

    def test_cancelled_date_only_still_knows_cohort_owner(self):
        self.seed_amgad_cohort()
        data = self.dashboard(5, date_from='2026-09-04', date_to='2026-09-04')
        self.assertEqual(len(data['sessions']), 1)
        self.assertEqual(data['kpis']['adjusted_sessions'], 0)
        self.assertEqual(data['kpis']['compliance_rate'], 0)

    def test_ten_and_eleven_point_checklists_use_actual_observations(self):
        self.seed_amgad_cohort()
        data = self.dashboard(5)
        summary = views.get_tutors_summary(self.factory.get('/')).data
        tutor = next(t for t in summary['trainers'] if t['name'] == 'Dr. Amgad Badewi')
        self.assertEqual(tutor['compliance_rate'], data['kpis']['compliance_rate'])
        self.assertEqual(data['sessions'][1]['criteria_status'], 'Fully Achieved')
        self.assertEqual(views._criteria_status(11, 0, 0), 'Fully Achieved')
        self.assertEqual(views._criteria_status(9, 1, 0), 'Partially Achieved')
        self.assertEqual(views._criteria_status(0, 0, 0), 'Not Evaluated')

    def test_cancelled_filter_applies_to_payload_and_kpis(self):
        self.seed_amgad_cohort()
        data = self.dashboard(5, cancelled_filter='cancelled')
        self.assertEqual(data['kpis']['total_sessions'], 1)
        self.assertEqual(data['kpis']['adjusted_sessions'], 0)
        self.assertEqual(data['charts']['totals']['met'], 0)

    def test_module_filter_is_exact_and_validated(self):
        self.rows.append({**self.covered_row, 'session_id': 'other-module', 'lms_module': 'Advanced AI'})
        groups = views._load_dashboard_doctor_dimensions()[1][2]
        module = next(m for g in groups for m in g['modules'] if m['name'] == 'Advanced AI')
        data = self.dashboard(2, module_id=module['id'])
        self.assertEqual([s['id'] for s in data['sessions']], ['other-module'])
        response = views.get_dashboard_data(self.factory.get('/', {'doctor_id': 2, 'module_id': 999}))
        self.assertEqual(response.status_code, 404)

    def test_legacy_qa_endpoint_does_not_fall_back_to_all_rows(self):
        response = views.get_qa_sessions_by_filters(self.factory.get('/', {'doctor_id': 2, 'module_id': 999}))
        self.assertEqual(response.status_code, 404)

    def test_ambiguous_short_name_does_not_choose_first_candidate(self):
        for names in (['Omar Badr', 'Omar Elshafey'], ['Omar Elshafey', 'Omar Badr']):
            self.assertIsNone(views._best_matching_doctor_from_text('Omar', names))
        self.assertIsNone(views._best_matching_doctor_from_text('Shields', list(self.doctors.values())))

    def test_covering_for_note_does_not_reverse_deliverer(self):
        row = {**self.covered_row, 'subject': 'Generic Cohort', 'lms_module': '',
               'trainer': 'Omar Elshafey (covering for Sharon Shields)'}
        result = views._build_session_attributions([row], list(self.doctors.values()))[row['session_id']]
        self.assertEqual(result['owner_doctor'], 'Sharon Shields')
        self.assertEqual(result['effective_doctor'], 'Omar Elshafey')

    def test_cofacilitator_is_not_mistaken_for_replacement(self):
        row = {**self.covered_row, 'trainer': 'Sharon Shields (with Omar Elshafey co-facilitating)'}
        result = views._build_session_attributions([row], list(self.doctors.values()))[row['session_id']]
        self.assertEqual(result['effective_doctor'], 'Sharon Shields')
        self.assertFalse(result['is_covered_session'])

    def test_unknown_cancelled_owner_is_visible_without_invented_credit(self):
        self.rows[:] = [
            {**self.covered_row, 'session_id': trainer, 'subject': 'Shared Module', 'lms_module': '',
             'trainer': trainer, 'cancelled_session': trainer == 'Session not delivered'}
            for trainer in ['Omar Elshafey', 'Keith Rowland', 'Session not delivered']
        ]
        for doctor_id in [1, 3]:
            data = self.dashboard(doctor_id)
            self.assertEqual(len(data['sessions']), 2)
            self.assertEqual(data['kpis']['adjusted_sessions'], 1)
        cancelled = data['sessions'][-1]
        self.assertIsNone(cancelled['owner_doctor'])
        self.assertIsNone(cancelled['effective_doctor'])

    def test_dimension_ids_are_stable_when_new_trainers_are_added(self):
        with patch.object(views, '_load_qa_trainers_with_counts', return_value=[('Sharon Shields', 3)]):
            old = views._build_dashboard_doctor_names()
        with patch.object(views, '_load_qa_trainers_with_counts', return_value=[('Adam Smith', 1), ('Sharon Shields', 3)]):
            new = views._build_dashboard_doctor_names()
        self.assertTrue(all(new[key] == value for key, value in old.items()))

    def test_invalid_dates_return_validation_error(self):
        for params in ({'date_from': 'bad'}, {'date_from': '2026-10-20', 'date_to': '2026-10-01'}):
            for endpoint in (views.get_dashboard_data, views.get_tutors_summary):
                response = endpoint(self.factory.get('/', {'doctor_id': 2, **params}))
                self.assertEqual(response.status_code, 400)
