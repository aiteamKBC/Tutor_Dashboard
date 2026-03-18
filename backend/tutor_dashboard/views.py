from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db.models import Count, Avg, Sum, Max, Q
from django.db import connection
from datetime import datetime
from collections import defaultdict
import os
import re
import html
import json
from accounts.models import DoctorProfile
from academics.models import Group, Module
from sessions.models import Session


def _normalize_name(value):
    return re.sub(r'[^a-z0-9]+', '', (value or '').lower())


def _pick_column(columns, env_value, candidates):
    if env_value and env_value in columns:
        return env_value

    by_normalized = {_normalize_name(col): col for col in columns}
    for candidate in candidates:
        matched = by_normalized.get(_normalize_name(candidate))
        if matched:
            return matched
    return None


def _canonical_person_name(value):
    text = (value or '').lower()
    text = re.sub(r'\b(dr|doctor|prof|professor)\.?\b', ' ', text)
    text = re.sub(r'[^a-z0-9\s]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _normalize_person_tokens(value):
    canonical = _canonical_person_name(value)
    return [t for t in canonical.split() if t]



def _normalize_doctor_identity(value):
    canonical = _canonical_person_name(value)
    alias_map = {
        'ray reed': 'ray mead',
        'ray meed': 'ray mead',
    }
    return alias_map.get(canonical, canonical)
def _simplify_qa_trainer_name(value):
    text = (value or '').strip()
    # Keep only the leading person-like part and drop notes like:
    # "Dr. Fredah Mwiti (covered mainly by Omar Elshafey)"
    # or "Nathan - Marketing Technology ..."
    text = re.sub(r'\(.*?\)', '', text)
    text = re.split(r'\s+-\s+', text, maxsplit=1)[0]
    # If multiple trainers appear in one cell, keep only the first person.
    text = re.split(r'\s+\band\b\s+|&|/|,', text, maxsplit=1, flags=re.IGNORECASE)[0]
    return text.strip()


def _extract_covering_doctor_name(raw_trainer, owner_doctor, doctor_names):
    """
    Try to detect who covered the session when trainer text is mixed/annotated.
    Returns a doctor display name if different from owner, else empty string.
    """
    text = str(raw_trainer or '').strip()
    if not text:
        return ''

    # 1) Prefer names inside parenthesis, e.g. "Dr. Ray (Amgad Badewi)"
    for note in re.findall(r'\((.*?)\)', text):
        candidate = _best_matching_doctor_from_text(note, doctor_names)
        if candidate and not _is_doctor_name_match(owner_doctor, candidate):
            return candidate

    # 2) Handle mixed trainer cells like "X and Y", "X & Y", "X/Y"
    split_parts = re.split(r'\s+\band\b\s+|&|/', re.sub(r'\(.*?\)', '', text), flags=re.IGNORECASE)
    for part in split_parts:
        candidate = _best_matching_doctor_from_text(part, doctor_names)
        if candidate and not _is_doctor_name_match(owner_doctor, candidate):
            return candidate

    # 3) Fallback to simplified trainer name.
    simplified = _simplify_qa_trainer_name(text)
    candidate = _best_matching_doctor_from_text(simplified, doctor_names)
    if candidate and not _is_doctor_name_match(owner_doctor, candidate):
        return candidate

    # 4) If trainer is a real different name but not in doctor list,
    # still show it as covered by that trainer.
    if simplified and not _is_doctor_name_match(owner_doctor, simplified):
        return simplified

    return ''


def _doctor_match_score(doctor_name, text):
    doctor_tokens = [t for t in _normalize_doctor_identity(doctor_name).split() if t]
    if not doctor_tokens:
        return 0

    text_tokens = set(_tokenize_text(_normalize_doctor_identity(text)))
    overlap = sum(1 for token in doctor_tokens if token in text_tokens)
    if overlap == 0:
        return 0

    score = overlap
    if _is_doctor_name_match(doctor_name, text):
        score += 2
    if doctor_tokens and doctor_tokens[0] in text_tokens:
        score += 1
    return score

def _best_matching_doctor_from_text(text, doctor_names):
    text_value = str(text or '')
    best_name = None
    best_score = 0
    for name in doctor_names:
        score = _doctor_match_score(name, text_value)
        if score > best_score:
            best_score = score
            best_name = name
    return best_name if best_score > 0 else None


def _infer_row_owner_doctor(row, doctor_names):
    """
    Resolve single owner for a QA row:
    1) If doctor name exists in subject OR LMS module, use that owner.
    2) Only when both fields have no doctor signal, fallback to trainer.
    """
    subject_text = str(row.get('subject') or row.get('hg_subject') or '').strip()
    lms_text = str(row.get('lms_module') or row.get('LMS_Module') or row.get('module') or '').strip()

    owner_from_subject = _best_matching_doctor_from_text(subject_text, doctor_names) if subject_text else None
    owner_from_lms = _best_matching_doctor_from_text(lms_text, doctor_names) if lms_text else None

    # Subject or LMS explicitly names a doctor -> use that (no trainer fallback).
    if owner_from_subject:
        return owner_from_subject
    if owner_from_lms:
        return owner_from_lms

    trainer_text = str(row.get('trainer') or '').strip()
    simplified_trainer_text = _simplify_qa_trainer_name(trainer_text)

    owner_from_trainer = _best_matching_doctor_from_text(trainer_text, doctor_names)
    if owner_from_trainer:
        return owner_from_trainer

    if simplified_trainer_text:
        return _best_matching_doctor_from_text(simplified_trainer_text, doctor_names)

    return None
def _is_doctor_name_match(kbc_name, qa_trainer_name):
    left_tokens = [t for t in _normalize_doctor_identity(kbc_name).split() if t]
    right_tokens = [t for t in _normalize_doctor_identity(_simplify_qa_trainer_name(qa_trainer_name)).split() if t]
    if not left_tokens or not right_tokens:
        return False

    left_norm = ''.join(left_tokens)
    right_norm = ''.join(right_tokens)
    if left_norm == right_norm:
        return True

    # Accept prefix-token matches to support abbreviated trainer names
    # like "Dr. Ray" vs "Dr. Ray Reed".
    shorter, longer = (left_tokens, right_tokens) if len(left_tokens) <= len(right_tokens) else (right_tokens, left_tokens)
    return len(shorter) >= 1 and longer[: len(shorter)] == shorter
def _public_doctor_display_name(name):
    text = str(name or '').strip()
    if re.match(r'^dr\.?\s+ray(\s+reed)?$', text, flags=re.IGNORECASE):
        return 'Dr. Ray Meed'
    return text
def _load_qa_trainers():
    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
    qa_table_q = f'"{qa_schema}"."{qa_table}"'

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT DISTINCT TRIM(CAST(trainer AS text)) AS trainer_name
            FROM {qa_table_q}
            WHERE COALESCE(TRIM(CAST(trainer AS text)), '') <> ''
            """
        )
        return [row[0] for row in cursor.fetchall() if row[0]]


def _load_qa_trainers_with_counts():
    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
    qa_table_q = f'"{qa_schema}"."{qa_table}"'

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT TRIM(CAST(trainer AS text)) AS trainer_name, COUNT(*) AS sessions_count
            FROM {qa_table_q}
            WHERE COALESCE(TRIM(CAST(trainer AS text)), '') <> ''
            GROUP BY 1
            """
        )
        return [(row[0], int(row[1] or 0)) for row in cursor.fetchall() if row[0]]


def _pick_preferred_doctor_display_name(kbc_name, qa_trainers_with_counts):
    """
    Pick the most representative QA trainer name for a doctor name coming from KBC.
    Prefers candidates with stronger token overlap, richer full names, and higher frequency.
    """
    kbc_tokens = set(_normalize_person_tokens(kbc_name))
    if not kbc_tokens:
        return kbc_name

    candidates = []
    for trainer_name, sessions_count in qa_trainers_with_counts:
        simplified = _simplify_qa_trainer_name(trainer_name)
        trainer_tokens = set(_normalize_person_tokens(simplified))
        if not trainer_tokens:
            continue

        overlap = len(kbc_tokens.intersection(trainer_tokens))
        if overlap == 0:
            continue

        exact_like = 1 if _is_doctor_name_match(kbc_name, simplified) else 0
        token_count = len(trainer_tokens)
        candidates.append((exact_like, overlap, token_count, sessions_count, simplified))

    if not candidates:
        return kbc_name

    candidates.sort(key=lambda x: (x[0], x[1], x[2], x[3]), reverse=True)
    return candidates[0][4]


def _load_shared_doctor_display_map(kbc_doctor_names):
    """
    Return mapping {kbc_name: preferred_display_name} for doctors that are shared
    between KBC LMS_Tutor Name and QA trainer.
    """
    qa_trainers_with_counts = _load_qa_trainers_with_counts()
    qa_trainers = [name for name, _ in qa_trainers_with_counts]

    shared_map = {}
    for kbc_name in sorted({n for n in kbc_doctor_names if n}):
        if not any(_is_doctor_name_match(kbc_name, trainer_name) for trainer_name in qa_trainers):
            continue
        shared_map[kbc_name] = _pick_preferred_doctor_display_name(kbc_name, qa_trainers_with_counts)

    return shared_map


def _load_qa_subject_groups_by_doctor(doctor_by_id):
    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
    qa_table_q = f'"{qa_schema}"."{qa_table}"'

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT *
            FROM {qa_table_q}
            WHERE COALESCE(TRIM(CAST(trainer AS text)), '') <> ''
              AND COALESCE(TRIM(CAST(subject AS text)), '') <> ''
            """
        )
        rows = cursor.fetchall()
        columns = [col[0] for col in cursor.description]

    row_dicts = [dict(zip(columns, row)) for row in rows]

    subject_counts_by_doctor = defaultdict(dict)
    doctor_names = list(doctor_by_id.values())

    for doctor_id, doctor_name in doctor_by_id.items():
        for row in row_dicts:
            trainer_name = str(row.get('trainer') or '').strip()
            subject_name = row.get('subject')
            lms_module_name = row.get('lms_module') or row.get('LMS_Module') or row.get('module')
            students_count = row.get('lms_students_count') or 0

            cleaned_subject = _clean_subject_for_group(subject_name)
            if not cleaned_subject:
                continue

            synthetic_row = {
                'trainer': trainer_name,
                'subject': cleaned_subject,
                'lms_module': lms_module_name,
                'LMS_Module': lms_module_name,
                'module': lms_module_name,
            }
            owner = _infer_row_owner_doctor(synthetic_row, doctor_names)
            if owner != doctor_name:
                continue

            current_count = subject_counts_by_doctor[doctor_id].get(cleaned_subject, 0)
            subject_counts_by_doctor[doctor_id][cleaned_subject] = max(current_count, int(students_count or 0))

    groups_by_doctor_id = defaultdict(list)
    for doctor_id, subject_map in subject_counts_by_doctor.items():
        sorted_subjects = sorted(subject_map.items(), key=lambda x: x[0].lower())
        groups_by_doctor_id[doctor_id] = [
            {'id': idx, 'name': subject_name, 'students_count': students_count}
            for idx, (subject_name, students_count) in enumerate(sorted_subjects, start=1)
        ]

    return groups_by_doctor_id


def _filter_doctors_with_qa_trainers(doctor_names):
    try:
        qa_trainers = _load_qa_trainers()
    except Exception:
        return doctor_names

    matched = []
    for doctor_name in doctor_names:
        if any(_is_doctor_name_match(doctor_name, trainer_name) for trainer_name in qa_trainers):
            matched.append(doctor_name)
    return matched


def _load_kbc_dimensions():
    if connection.vendor != 'postgresql':
        raise RuntimeError('KBC endpoints require PostgreSQL/Neon. Set USE_SQLITE=False and configure DB_* env vars.')

    schema = os.getenv('KBC_TABLE_SCHEMA', 'public')
    table = os.getenv('KBC_TABLE_NAME', 'kbc_users_data')
    doctor_override = os.getenv('KBC_DOCTOR_COLUMN')
    group_override = os.getenv('KBC_GROUP_COLUMN')
    module_override = os.getenv('KBC_MODULE_COLUMN')

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            """,
            [schema, table],
        )
        table_columns = [row[0] for row in cursor.fetchall()]

    if not table_columns:
        raise RuntimeError(f'Table {schema}.{table} not found or not accessible')

    doctor_col = _pick_column(
        table_columns,
        doctor_override,
        [
            'LMS_Tutor name',
            'LMS_Tutor Name',
            'lms_tutor_name',
            'lms_tutorname',
            'LMS__Tutor Name',
            'lms__tutorname',
        ],
    )
    group_col = _pick_column(
        table_columns,
        group_override,
        ['group', 'group_name', 'groupname', 'cohort', 'section', 'batch', 'class'],
    )
    module_col = _pick_column(
        table_columns,
        module_override,
        [
            'lms__matchedmodule',
            'LMS__MatchedModule',
            'lms__module_text',
            'LMS__Course',
            'module',
            'module_name',
            'modulename',
            'course',
            'subject',
            'activity',
        ],
    )

    missing = []
    if not doctor_col:
        missing.append('doctor column')
    if not group_col:
        missing.append('group column')
    if not module_col:
        missing.append('module column')

    if missing:
        raise RuntimeError(
            f"Could not resolve {', '.join(missing)} in {schema}.{table}. "
            "Set KBC_DOCTOR_COLUMN, KBC_GROUP_COLUMN, and KBC_MODULE_COLUMN."
        )

    doctor_q = f'"{doctor_col}"'
    group_q = f'"{group_col}"'
    module_q = f'"{module_col}"'
    table_q = f'"{schema}"."{table}"'

    sql = f"""
        SELECT DISTINCT
            TRIM(CAST({doctor_q} AS text)) AS doctor_name,
            TRIM(CAST({group_q} AS text)) AS group_name,
            TRIM(CAST({module_q} AS text)) AS module_name
        FROM {table_q}
        WHERE COALESCE(TRIM(CAST({doctor_q} AS text)), '') <> ''
          AND COALESCE(TRIM(CAST({group_q} AS text)), '') <> ''
          AND COALESCE(TRIM(CAST({module_q} AS text)), '') <> ''
    """

    with connection.cursor() as cursor:
        cursor.execute(sql)
        rows = cursor.fetchall()

    source_doctors = sorted({row[0] for row in rows if row[0]})
    try:
        source_to_display = _load_shared_doctor_display_map(source_doctors)
    except Exception:
        source_to_display = {}

    # Use preferred shared display names (from QA matching) as canonical doctor names.
    doctors = sorted(set(source_to_display.values()))
    doctor_by_id = {idx: name for idx, name in enumerate(doctors, start=1)}
    doctor_id_by_name = {name: idx for idx, name in doctor_by_id.items()}

    doctor_group_pairs = sorted(
        {
            (source_to_display.get(row[0], row[0]), row[1])
            for row in rows
            if row[0] and row[1] and row[0] in source_to_display
        }
    )
    group_by_id = {idx: pair for idx, pair in enumerate(doctor_group_pairs, start=1)}

    groups_by_doctor_id = defaultdict(list)
    for group_id, (doctor_name, group_name) in group_by_id.items():
        doctor_id = doctor_id_by_name.get(doctor_name)
        if doctor_id:
            groups_by_doctor_id[doctor_id].append(
                {'id': group_id, 'name': group_name, 'students_count': 0}
            )

    modules_by_group_id = defaultdict(list)
    for group_id, (doctor_name, group_name) in group_by_id.items():
        modules = sorted(
            {
                row[2]
                for row in rows
                if source_to_display.get(row[0], row[0]) == doctor_name and row[1] == group_name and row[2]
            }
        )
        modules_by_group_id[group_id] = [
            {'id': idx, 'name': module_name, 'code': None}
            for idx, module_name in enumerate(modules, start=1)
        ]

    return doctor_by_id, groups_by_doctor_id, modules_by_group_id


def _resolve_selected_names(doctor_id, group_id, module_id):
    doctor_by_id, groups_by_doctor_id, modules_by_group_id = _load_kbc_dimensions()

    doctor_key = int(doctor_id)
    group_key = int(group_id)
    module_key = int(module_id)

    doctor_name = doctor_by_id.get(doctor_key)
    if not doctor_name:
        raise ValueError('Doctor not found')

    group_name = None
    for doctor_groups in groups_by_doctor_id.values():
        for grp in doctor_groups:
            if int(grp['id']) == group_key:
                group_name = grp['name']
                break
        if group_name:
            break
    if not group_name:
        raise ValueError('Group not found')

    module_name = None
    for mod in modules_by_group_id.get(group_key, []):
        if int(mod['id']) == module_key:
            module_name = mod['name']
            break
    if not module_name:
        raise ValueError('Module not found')

    return doctor_name, group_name, module_name


def _module_subject_patterns(module_name):
    cleaned = re.sub(r'\s+', ' ', (module_name or '').strip())
    patterns = [cleaned] if cleaned else []

    # Remove optional leading code prefix like "G1 -"
    no_prefix = re.sub(r'^[A-Za-z0-9]+\s*-\s*', '', cleaned).strip()
    if no_prefix and no_prefix not in patterns:
        patterns.append(no_prefix)

    return patterns


def _clean_subject_for_group(value):
    """
    Normalize subject text for group dropdown/filtering:
    - collapse whitespace / decode HTML entities
    - if subject starts with "A and B - ...", keep first owner "A - ..."
    - skip items that look like names-only mixed trainers
    """
    text = html.unescape(str(value or ''))
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return ''

    if ' - ' in text:
        prefix, rest = text.split(' - ', 1)
        if re.search(r'\band\b', prefix, flags=re.IGNORECASE):
            first_owner = re.split(r'\band\b', prefix, flags=re.IGNORECASE)[0].strip(' -')
            text = f'{first_owner} - {rest.strip()}'
        return text.strip()

    # Names-only mixed values like "X and Y" are noisy for group filter.
    if re.search(r'\band\b', text, flags=re.IGNORECASE):
        return ''

    return text


def _extract_subject_prefix(value):
    text = re.sub(r'\s+', ' ', (value or '').strip())
    if not text:
        return ''
    first_part = re.split(r'\s*-\s*', text, maxsplit=1)[0].strip()
    if re.match(r'^[A-Za-z]+\d+$', first_part):
        return first_part.upper()
    return ''


def _tokenize_text(value):
    text = html.unescape((value or '').lower())
    return re.findall(r'[a-z]{3,}', text)


def _module_subject_tokens(module_name):
    tokens = _tokenize_text(module_name)
    if not tokens:
        return []

    # Add acronym token, e.g. "project management professional" -> "pmp"
    acronym = ''.join(token[0] for token in tokens if len(token) >= 3)
    all_tokens = set(tokens)
    if len(acronym) >= 3:
        all_tokens.add(acronym)

    return sorted(all_tokens, key=len, reverse=True)


def _normalize_module_for_match(value):
    text = html.unescape(str(value or ''))
    text = re.sub(r'\s+', ' ', text).strip().lower()
    return text


def _load_attendance_counts_by_date_module(date_values):
    """
    Load attended students counts from attendance storage.
    Returns: {(date, normalized_module): count_of_value_1}
    """
    if not date_values:
        return {}

    schema = os.getenv('KBC_TABLE_SCHEMA', 'public')
    table = os.getenv('KBC_ATTENDANCE_TABLE_NAME', 'kbc_attendance')

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            """,
            [schema, table],
        )
        table_columns = [row[0] for row in cursor.fetchall()]

    if not table_columns:
        return {}

    attendance_col = _pick_column(
        table_columns,
        os.getenv('KBC_ATTENDANCE_VALUE_COLUMN'),
        ['Attendance', 'attendance'],
    )
    date_col = _pick_column(
        table_columns,
        os.getenv('KBC_ATTENDANCE_DATE_COLUMN'),
        ['date', 'session_date', 'attendance_date'],
    )
    module_col = _pick_column(
        table_columns,
        os.getenv('KBC_ATTENDANCE_MODULE_COLUMN'),
        ['module', 'module_name', 'activity', 'course', 'subject'],
    )
    if not attendance_col or not date_col or not module_col:
        return {}

    table_q = f'"{schema}"."{table}"'
    attendance_q = f'"{attendance_col}"'
    date_q = f'"{date_col}"'
    module_q = f'"{module_col}"'

    counts = defaultdict(int)
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT
                CAST({date_q} AS text) AS session_date,
                TRIM(COALESCE(CAST({module_q} AS text), '')) AS module_name,
                CAST({attendance_q} AS text) AS attendance_value
            FROM {table_q}
            WHERE CAST({date_q} AS text) = ANY(%s)
            """,
            [list(date_values)],
        )
        rows = cursor.fetchall()

    for session_date, module_name, attendance_value in rows:
        try:
            present = int(attendance_value or 0)
        except Exception:
            present = 0
        if present != 1:
            continue
        module_key = _normalize_module_for_match(module_name)
        if not module_key:
            continue
        counts[(str(session_date), module_key)] += 1

    return dict(counts)


def _lookup_attendance_count_fuzzy(session_date, session_module_key, attendance_counts_by_date_module):
    """
    Fuzzy lookup for attendance count when exact (date,module) key is not found.
    Tries same-date module keys using tolerant module matching and returns max count.
    """
    if not session_date or not session_module_key:
        return 0

    exact = attendance_counts_by_date_module.get((session_date, session_module_key), 0)
    if exact > 0:
        return exact

    best = 0
    for (d, module_key), count in attendance_counts_by_date_module.items():
        if d != session_date:
            continue
        if _module_text_match(session_module_key, module_key):
            best = max(best, int(count or 0))
    return best


def _extract_lms_student_ids(raw_lms_students):
    """
    Extract LMS student IDs from qa_doctors_sessions.lms_students JSON payload.
    Supports dict/list/json-string variants.
    """
    payload = raw_lms_students
    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            return []
        try:
            payload = json.loads(text)
        except Exception:
            return []

    students = []
    if isinstance(payload, dict):
        students = payload.get('students') or payload.get('Students') or []
    elif isinstance(payload, list):
        students = payload
    else:
        return []

    ids = []
    for student in students:
        if not isinstance(student, dict):
            continue
        student_id = (
            student.get('ID')
            or student.get('id')
            or student.get('StudentID')
            or student.get('student_id')
        )
        if student_id is None:
            continue
        try:
            ids.append(str(int(student_id)))
        except Exception:
            text = str(student_id).strip()
            if text:
                ids.append(text)
    return ids


def _module_text_match(session_module, attendance_module):
    """
    Compare module strings with tolerant matching:
    exact normalized OR one contains the other OR token overlap >= 2.
    """
    left = _normalize_module_for_match(session_module)
    right = _normalize_module_for_match(attendance_module)
    if not left or not right:
        return False
    if left == right:
        return True
    if left in right or right in left:
        return True

    left_tokens = set(_tokenize_text(left))
    right_tokens = set(_tokenize_text(right))
    overlap = left_tokens.intersection(right_tokens)
    return len(overlap) >= 2


def _select_dominant_attendance_module(session_module, modules_by_student):
    """
    Choose the attendance module that best represents the session for one date cohort.
    Priority:
    1. Highest distinct-student count.
    2. If tied, prefer best match with session module.
    3. Fallback to stable lexical order.
    """
    counts = defaultdict(int)
    for module_keys in modules_by_student.values():
        for module_key in set(module_keys):
            if module_key:
                counts[module_key] += 1

    if not counts:
        return ''

    session_module_key = _normalize_module_for_match(session_module)
    best_module = ''
    best_count = -1
    best_match_rank = -1

    for module_key, count in counts.items():
        match_rank = 0
        if session_module_key:
            if module_key == session_module_key:
                match_rank = 3
            elif _module_text_match(session_module_key, module_key):
                match_rank = 2
            elif session_module_key in module_key or module_key in session_module_key:
                match_rank = 1

        if (
            count > best_count
            or (count == best_count and match_rank > best_match_rank)
            or (count == best_count and match_rank == best_match_rank and module_key < best_module)
        ):
            best_module = module_key
            best_count = count
            best_match_rank = match_rank

    return best_module


def _load_attendance_presence_by_student_date(student_ids, date_values):
    """
    Load attendance rows from kbc_attendance for specific students and dates.
    Returns:
      {(student_id, date): [normalized_module_name, ...]} only for Attendance=1.
    """
    if not student_ids or not date_values:
        return {}

    schema = os.getenv('KBC_TABLE_SCHEMA', 'public')
    table = os.getenv('KBC_ATTENDANCE_TABLE_NAME', 'kbc_attendance')

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            """,
            [schema, table],
        )
        table_columns = [row[0] for row in cursor.fetchall()]

    if not table_columns:
        return {}

    attendance_col = _pick_column(
        table_columns,
        os.getenv('KBC_ATTENDANCE_VALUE_COLUMN'),
        ['Attendance', 'attendance'],
    )
    id_col = _pick_column(
        table_columns,
        os.getenv('KBC_ATTENDANCE_ID_COLUMN'),
        ['ID', 'id', 'student_id', 'StudentID'],
    )
    date_col = _pick_column(
        table_columns,
        os.getenv('KBC_ATTENDANCE_DATE_COLUMN'),
        ['date', 'session_date', 'attendance_date'],
    )
    module_col = _pick_column(
        table_columns,
        os.getenv('KBC_ATTENDANCE_MODULE_COLUMN'),
        ['module', 'module_name', 'activity', 'course', 'subject'],
    )
    if not attendance_col or not id_col or not date_col or not module_col:
        return {}

    table_q = f'"{schema}"."{table}"'
    attendance_q = f'"{attendance_col}"'
    id_q = f'"{id_col}"'
    date_q = f'"{date_col}"'
    module_q = f'"{module_col}"'

    presence = defaultdict(list)
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT
                CAST({id_q} AS text) AS student_id,
                CAST({date_q} AS text) AS session_date,
                TRIM(COALESCE(CAST({module_q} AS text), '')) AS module_name
            FROM {table_q}
            WHERE CAST({id_q} AS text) = ANY(%s)
              AND CAST({date_q} AS text) = ANY(%s)
              AND CAST(COALESCE({attendance_q}, 0) AS integer) = 1
            """,
            [list({str(s).strip() for s in student_ids if str(s).strip()}), list(date_values)],
        )
        rows = cursor.fetchall()

    for student_id, session_date, module_name in rows:
        key = (str(student_id).strip(), str(session_date))
        module_key = _normalize_module_for_match(module_name)
        if module_key and module_key not in presence[key]:
            presence[key].append(module_key)

    return dict(presence)


def _resolve_doctor_group_names(doctor_id, group_id):
    doctor_by_id, groups_by_doctor_id, _ = _load_kbc_dimensions()
    doctor_key = int(doctor_id)
    group_key = int(group_id)

    doctor_name = doctor_by_id.get(doctor_key)
    if not doctor_name:
        raise ValueError('Doctor not found')

    group_name = None
    for grp in groups_by_doctor_id.get(doctor_key, []):
        if int(grp['id']) == group_key:
            group_name = grp['name']
            break
    if not group_name:
        raise ValueError('Group not found')

    return doctor_name, group_name


def _parse_duration_to_minutes(value):
    text = (value or '').lower()
    if not text:
        return 0
    hours_match = re.search(r'(\d+)\s*hour', text)
    mins_match = re.search(r'(\d+)\s*minute', text)
    total = 0
    if hours_match:
        total += int(hours_match.group(1)) * 60
    if mins_match:
        total += int(mins_match.group(1))
    if total == 0:
        num_match = re.search(r'(\d+)', text)
        if num_match:
            total = int(num_match.group(1))
    return total


def _criteria_status(met_count):
    if met_count >= 12:
        return 'Fully Achieved'
    if met_count >= 9:
        return 'Partially Achieved'
    return 'Needs Improvement'


def _normalize_checklist_status(value):
    text = (value or '').strip().lower()
    if text == 'met':
        return 'Met'
    if text in ('partial', 'partially met'):
        return 'Partial'
    if text in ('not met', 'not_met'):
        return 'Not Met'
    return 'Not Met'


def _normalize_checklist_code(value):
    return (value or '').strip().upper().replace(' ', '_')


CHECKLIST_CODE_BY_ORDER = {
    1: 'SESSION_DURATION',
    2: 'PUNCTUALITY',
    3: 'PROFESSIONAL_DEMEANOR',
    4: 'LEARNING_OBJECTIVES',
    5: 'CONTENT_ALIGNMENT',
    6: 'STRUCTURE_AND_PACING',
    7: 'LEARNER_ENGAGEMENT',
    8: 'TEACHING_METHODS',
    9: 'UNDERSTANDING_CHECKS',
    10: 'REAL_WORLD_EXAMPLES',
    11: 'SAFEGUARDING',
    12: 'NEXT_STEPS',
}

CHECKLIST_CODE_ALIASES = {
    'SESSION_DURATION': 'SESSION_DURATION',
    'PUNCTUALITY': 'PUNCTUALITY',
    'PROFESSIONAL_DEMEANOR': 'PROFESSIONAL_DEMEANOR',
    'LEARNING_OBJECTIVES': 'LEARNING_OBJECTIVES',
    'CONTENT_ALIGNMENT': 'CONTENT_ALIGNMENT',
    'STRUCTURE_AND_PACING': 'STRUCTURE_AND_PACING',
    'LEARNER_ENGAGEMENT': 'LEARNER_ENGAGEMENT',
    'TEACHING_METHODS': 'TEACHING_METHODS',
    'TEACHING_METHODS_AND_RESOURCES': 'TEACHING_METHODS',
    'UNDERSTANDING_CHECKS': 'UNDERSTANDING_CHECKS',
    'REAL_WORLD_EXAMPLES': 'REAL_WORLD_EXAMPLES',
    'SAFEGUARDING': 'SAFEGUARDING',
    'SAFEGUARDING_AND_SUPPORT': 'SAFEGUARDING',
    'NEXT_STEPS': 'NEXT_STEPS',
}


def _derive_checklist_code(raw_code, checklist_item, checklist_order):
    """
    Return stable canonical code for the 12 checklist items.
    Priority:
    1) explicit checklist_code if it looks like a compact code
    2) checklist_order mapping (1..12)
    3) checklist_item keyword fallback
    """
    normalized = _normalize_checklist_code(raw_code)
    normalized_compact = re.sub(r'[^A-Z0-9_]+', '_', normalized).strip('_')
    if normalized_compact in CHECKLIST_CODE_ALIASES:
        return CHECKLIST_CODE_ALIASES[normalized_compact]

    try:
        order_num = int(checklist_order) if checklist_order is not None else None
    except Exception:
        order_num = None
    if order_num in CHECKLIST_CODE_BY_ORDER:
        return CHECKLIST_CODE_BY_ORDER[order_num]

    item_text = (checklist_item or '').strip().lower()
    if 'session duration' in item_text:
        return 'SESSION_DURATION'
    if 'punctuality' in item_text:
        return 'PUNCTUALITY'
    if 'professional demeanor' in item_text:
        return 'PROFESSIONAL_DEMEANOR'
    if 'learning objectives' in item_text:
        return 'LEARNING_OBJECTIVES'
    if 'content alignment' in item_text:
        return 'CONTENT_ALIGNMENT'
    if 'structure and pacing' in item_text:
        return 'STRUCTURE_AND_PACING'
    if 'learner engagement' in item_text:
        return 'LEARNER_ENGAGEMENT'
    if 'teaching methods' in item_text:
        return 'TEACHING_METHODS'
    if 'understanding checks' in item_text:
        return 'UNDERSTANDING_CHECKS'
    if 'real-world examples' in item_text or 'real world examples' in item_text:
        return 'REAL_WORLD_EXAMPLES'
    if 'safeguarding' in item_text:
        return 'SAFEGUARDING'
    if 'next steps' in item_text:
        return 'NEXT_STEPS'

    if normalized_compact in CHECKLIST_CODE_ALIASES:
        return CHECKLIST_CODE_ALIASES[normalized_compact]
    return normalized_compact


def _has_evidence_value(value):
    text = str(value or '').strip().lower()
    if text in ('', 'no', 'none', 'null', 'n/a', 'na', 'false', '0'):
        return False
    if text.startswith('no '):
        return False
    if text.startswith('no-'):
        return False
    if text.startswith('no_'):
        return False
    if text.startswith('no evidence'):
        return False
    if text.startswith('not available'):
        return False
    if text.startswith('not provided'):
        return False
    return True


def _load_checklist_map(session_ids):
    if not session_ids:
        return {}

    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    checklist_table = os.getenv('QA_CHECKLIST_TABLE_NAME', 'qa_doctors_checklist_items')
    checklist_q = f'"{qa_schema}"."{checklist_table}"'

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            """,
            [qa_schema, checklist_table],
        )
        checklist_columns = [row[0] for row in cursor.fetchall()]

    if not checklist_columns:
        return {}

    session_col = _pick_column(checklist_columns, os.getenv('QA_CHECKLIST_SESSION_ID_COLUMN'), ['session_id'])
    session_match_col = _pick_column(
        checklist_columns,
        os.getenv('QA_CHECKLIST_SESSION_MATCH_COLUMN'),
        ['session_id_match', 'session_match_id', 'session_match'],
    )
    code_col = _pick_column(
        checklist_columns,
        os.getenv('QA_CHECKLIST_CODE_COLUMN'),
        ['checklist_code', 'checklist_item_code', 'code'],
    )
    status_col = _pick_column(checklist_columns, os.getenv('QA_CHECKLIST_STATUS_COLUMN'), ['status'])
    order_col = _pick_column(
        checklist_columns,
        os.getenv('QA_CHECKLIST_ORDER_COLUMN'),
        ['checklist_order', 'checklist_item_order', 'order'],
    )
    item_col = _pick_column(
        checklist_columns,
        os.getenv('QA_CHECKLIST_ITEM_COLUMN'),
        ['checklist_item', 'item', 'label', 'name'],
    )
    evidence_col = _pick_column(checklist_columns, os.getenv('QA_CHECKLIST_EVIDENCE_COLUMN'), ['evidence'])

    if not session_col or not status_col:
        return {}

    session_q = f'"{session_col}"'
    session_match_q = f'"{session_match_col}"' if session_match_col else None
    code_expr = f'"{code_col}"' if code_col else (f'"{item_col}"' if item_col else 'NULL')
    order_expr = f'"{order_col}"' if order_col else 'NULL'
    item_expr = f'"{item_col}"' if item_col else 'NULL'
    evidence_expr = f'"{evidence_col}"' if evidence_col else 'NULL'
    status_q = f'"{status_col}"'

    normalized_session_ids = {str(s).strip() for s in session_ids if str(s).strip()}
    items_by_session = defaultdict(dict)
    with connection.cursor() as cursor:
        where_sql = f"TRIM(CAST({session_q} AS text)) = ANY(%s)"
        params = [list(normalized_session_ids)]
        if session_match_q:
            where_sql += f" OR TRIM(CAST({session_match_q} AS text)) = ANY(%s)"
            params.append(list(normalized_session_ids))

        cursor.execute(
            f"""
            SELECT
                TRIM(CAST({session_q} AS text)) AS session_id,
                {f"TRIM(CAST({session_match_q} AS text))" if session_match_q else "NULL"} AS session_id_match,
                {code_expr} AS checklist_code,
                {status_q} AS status,
                {order_expr} AS checklist_order,
                {item_expr} AS checklist_item,
                {evidence_expr} AS evidence
            FROM {checklist_q}
            WHERE {where_sql}
            ORDER BY checklist_order ASC NULLS LAST
            """,
            params,
        )
        rows = cursor.fetchall()

        # Pass 1: exact session_id matches (highest priority).
        for session_id, session_id_match, checklist_code, status, _order, checklist_item, evidence in rows:
            code = _derive_checklist_code(checklist_code, checklist_item, _order)
            if not code:
                continue

            row_payload = {
                'code': code,
                'status': _normalize_checklist_status(status),
                'order': int(_order) if _order is not None else None,
                'item': (checklist_item or '').strip(),
                'evidence': str(evidence or '').strip(),
                'has_evidence': _has_evidence_value(evidence),
            }

            sid = str(session_id or '').strip()
            if sid and sid in normalized_session_ids and code not in items_by_session[sid]:
                items_by_session[sid][code] = row_payload

        # Pass 2: fallback via session_id_match only for missing checklist codes.
        for session_id, session_id_match, checklist_code, status, _order, checklist_item, evidence in rows:
            code = _derive_checklist_code(checklist_code, checklist_item, _order)
            if not code:
                continue

            row_payload = {
                'code': code,
                'status': _normalize_checklist_status(status),
                'order': int(_order) if _order is not None else None,
                'item': (checklist_item or '').strip(),
                'evidence': str(evidence or '').strip(),
                'has_evidence': _has_evidence_value(evidence),
            }

            sid_match = str(session_id_match or '').strip()
            if sid_match and sid_match in normalized_session_ids and code not in items_by_session[sid_match]:
                items_by_session[sid_match][code] = row_payload

    return {
        key: sorted(values.values(), key=lambda x: (x['order'] is None, x['order'] if x['order'] is not None else 999))
        for key, values in items_by_session.items()
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def get_doctors(request):
    """Get distinct doctors from Neon kbc_users_data."""
    try:
        doctor_by_id, groups_by_doctor_id, _ = _load_kbc_dimensions()
        groups_by_doctor_id = _load_qa_subject_groups_by_doctor(doctor_by_id)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    doctor_id_by_name = {name: doctor_id for doctor_id, name in doctor_by_id.items()}
    doctor_id_by_name = {name: doctor_id for doctor_id, name in doctor_by_id.items()}

    doctors = [{'id': doctor_id, 'display_name': _public_doctor_display_name(name)} for doctor_id, name in doctor_by_id.items()]
    return Response(doctors)


@api_view(['GET'])
@permission_classes([AllowAny])
def search_doctors(request):
    """
    Search doctors by name and return nested groups/modules for each doctor.
    Query param: q
    """
    query = (request.GET.get('q') or '').strip().lower()
    if len(query) < 2:
        return Response([])

    try:
        doctor_by_id, groups_by_doctor_id, modules_by_group_id = _load_kbc_dimensions()
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    results = []
    for doctor_id, doctor_name in doctor_by_id.items():
        if query not in doctor_name.lower():
            continue

        doctor_groups = []
        for group in groups_by_doctor_id.get(doctor_id, []):
            group_id = int(group['id'])
            doctor_groups.append(
                {
                    'id': group_id,
                    'name': group['name'],
                    'students_count': group.get('students_count', 0),
                    'modules': modules_by_group_id.get(group_id, []),
                }
            )

        results.append(
            {
                'id': doctor_id,
                'display_name': _public_doctor_display_name(doctor_name),
                'groups': doctor_groups,
            }
        )

    return Response(results[:20])


@api_view(['GET'])
@permission_classes([AllowAny])
def get_doctor_groups(request, doctor_id):
    """Get subject groups from qa_doctors_sessions for the selected doctor."""
    try:
        doctor_key = int(doctor_id)
        doctor_by_id, _, _ = _load_kbc_dimensions()
        groups_by_doctor_id = _load_qa_subject_groups_by_doctor(doctor_by_id)
    except ValueError:
        return Response({'error': 'doctor_id must be integer'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if doctor_key not in doctor_by_id:
        return Response({'error': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response(groups_by_doctor_id.get(doctor_key, []))


@api_view(['GET'])
@permission_classes([AllowAny])
def get_group_modules(request, group_id):
    """Get modules from Neon for the selected group."""
    try:
        group_key = int(group_id)
        _, _, modules_by_group_id = _load_kbc_dimensions()
    except ValueError:
        return Response({'error': 'group_id must be integer'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if group_key not in modules_by_group_id:
        return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response(modules_by_group_id.get(group_key, []))


@api_view(['GET'])
@permission_classes([AllowAny])
def get_qa_sessions_by_filters(request):
    """
    Return rows from qa_doctors_sessions matched by selected doctor/group/module.
    Matching is performed against qa_doctors_sessions.subject.
    """
    doctor_id = request.GET.get('doctor_id')
    group_id = request.GET.get('group_id')
    module_id = request.GET.get('module_id')

    if not all([doctor_id, group_id, module_id]):
        return Response(
            {'error': 'doctor_id, group_id, and module_id are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        doctor_name, group_name, module_name = _resolve_selected_names(doctor_id, group_id, module_id)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
    qa_table_q = f'"{qa_schema}"."{qa_table}"'
    patterns = _module_subject_patterns(module_name)

    rows = []
    columns = []
    used_pattern = None
    match_mode = 'subject_exact_like'

    try:
        with connection.cursor() as cursor:
            for pattern in patterns:
                cursor.execute(
                    f"""
                    SELECT *
                    FROM {qa_table_q}
                    WHERE COALESCE(TRIM(CAST(subject AS text)), '') <> ''
                      AND subject ILIKE %s
                    ORDER BY date DESC NULLS LAST
                    """,
                    [f'%{pattern}%']
                )
                fetched = cursor.fetchall()
                if fetched:
                    rows = fetched
                    columns = [col[0] for col in cursor.description]
                    used_pattern = pattern
                    break

            if not rows:
                # Fallback token matching on subject text (contains >=2 tokens where possible).
                tokens = _module_subject_tokens(module_name)
                cursor.execute(
                    f"""
                    SELECT *
                    FROM {qa_table_q}
                    WHERE COALESCE(TRIM(CAST(subject AS text)), '') <> ''
                    ORDER BY date DESC NULLS LAST
                    """
                )
                all_rows = cursor.fetchall()
                columns = [col[0] for col in cursor.description]
                subject_idx = columns.index('subject') if 'subject' in columns else -1

                if subject_idx >= 0 and tokens:
                    min_score = 2 if len(tokens) >= 2 else 1
                    filtered = []
                    for row in all_rows:
                        subject_tokens = set(_tokenize_text(str(row[subject_idx] or '')))
                        score = sum(1 for t in tokens if t in subject_tokens)
                        if score >= min_score:
                            filtered.append(row)
                    if filtered:
                        rows = filtered
                        used_pattern = ', '.join(tokens[:5])
                        match_mode = 'subject_token_overlap'

                if not rows:
                    # Last fallback: return all rows to aid debugging if no subject match found.
                    rows = all_rows
                    match_mode = 'fallback_all_rows'
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    serialized_rows = [dict(zip(columns, row)) for row in rows]

    return Response({
        'filters': {
            'doctor_id': int(doctor_id),
            'doctor_name': doctor_name,
            'group_id': int(group_id),
            'group_name': group_name,
            'module_id': int(module_id),
            'module_name': module_name,
        },
        'match': {
            'column': 'subject',
            'mode': match_mode,
            'patterns_tried': patterns,
            'used_pattern': used_pattern,
        },
        'count': len(serialized_rows),
        'results': serialized_rows,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def get_dashboard_data(request):
    """Get complete dashboard data from qa_doctors_sessions based on filters."""
    doctor_id = request.GET.get('doctor_id')
    group_id = request.GET.get('group_id')
    module_id = request.GET.get('module_id')
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')
    status_filter = request.GET.get('status')

    if not doctor_id:
        return Response(
            {'error': 'doctor_id is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        doctor_key = int(doctor_id)
        group_key = int(group_id) if group_id is not None else 0
        selected_module_key = int(module_id) if module_id is not None else 0
    except ValueError:
        return Response({'error': 'doctor_id, group_id and module_id must be integers'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        doctor_by_id, _, _ = _load_kbc_dimensions()
        groups_by_doctor_id = _load_qa_subject_groups_by_doctor(doctor_by_id)
        doctor_name = doctor_by_id.get(doctor_key)
        if not doctor_name:
            return Response({'error': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        group_name = 'All Groups'
        if group_key != 0:
            group_match = next((g for g in groups_by_doctor_id.get(doctor_key, []) if int(g['id']) == group_key), None)
            if not group_match:
                return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
            group_name = group_match['name']

        module_name = 'All Modules'
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
    qa_table_q = f'"{qa_schema}"."{qa_table}"'

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT *
                FROM {qa_table_q}
                ORDER BY date DESC NULLS LAST
                """
            )
            all_rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    row_dicts_all = [dict(zip(columns, row)) for row in all_rows]
    row_dicts = list(row_dicts_all)
    doctor_names = list(doctor_by_id.values())

    # Filter by selected doctor:
    # 1) owner inference (subject/trainer),
    # 2) OR subject matches one of doctor's known groups (source-of-truth from dropdown).
    doctor_groups = groups_by_doctor_id.get(doctor_key, [])
    doctor_group_names = [re.sub(r'\s+', ' ', str(g.get('name') or '').strip()) for g in doctor_groups if g.get('name')]

    def _normalize_subject_match_text(value):
        # Keep cancellation marker as part of identity so
        # "Canceled: X" does not match normal "X".
        text = _clean_subject_for_group(value)
        return re.sub(r'\s+', ' ', text).strip()

    def _subject_matches_group(subject_value, group_value):
        subject_text = _normalize_subject_match_text(subject_value)
        selected_text = _normalize_subject_match_text(group_value)
        if not subject_text or not selected_text:
            return False

        # Exact module/group match only.
        return subject_text.lower() == selected_text.lower()

    owner_filtered = []
    for row in row_dicts:
        owner = _infer_row_owner_doctor(row, doctor_names)
        if owner == doctor_name:
            owner_filtered.append(row)
            continue
        covering_doctor = _extract_covering_doctor_name(row.get('trainer'), owner, doctor_names)
        if covering_doctor == doctor_name:
            owner_filtered.append(row)
            continue
        if any(_subject_matches_group(row.get('subject'), group_name) for group_name in doctor_group_names):
            owner_filtered.append(row)

    # Always apply selected doctor scope.
    row_dicts = owner_filtered

    # Filter by selected subject (Group dropdown) unless "All Groups"
    if group_key != 0:
        def _filter_rows_by_group(rows):
            group_filtered = []
            for row in rows:
                if _subject_matches_group(row.get('subject'), group_name):
                    group_filtered.append(row)
            return group_filtered

        # Keep filtering inside selected doctor scope.
        group_filtered = _filter_rows_by_group(row_dicts)

        row_dicts = group_filtered

    # Filter by module on subject unless "All Modules"
    if selected_module_key != 0:
        patterns = _module_subject_patterns(module_name)
        exact_like = []
        for row in row_dicts:
            subject = str(row.get('subject') or '')
            if any(p and p.lower() in subject.lower() for p in patterns):
                exact_like.append(row)

        if exact_like:
            row_dicts = exact_like
        else:
            tokens = _module_subject_tokens(module_name)
            min_score = 2 if len(tokens) >= 2 else 1
            token_like = []
            for row in row_dicts:
                subject_tokens = set(_tokenize_text(str(row.get('subject') or '')))
                score = sum(1 for t in tokens if t in subject_tokens)
                if score >= min_score:
                    token_like.append(row)
            if token_like:
                row_dicts = token_like

    # Optional date filters
    if date_from:
        row_dicts = [r for r in row_dicts if str(r.get('date') or '') >= date_from]
    if date_to:
        row_dicts = [r for r in row_dicts if str(r.get('date') or '') <= date_to]

    def as_int(v):
        try:
            return int(v or 0)
        except Exception:
            return 0

    def as_bool(v):
        text = str(v or '').strip().lower()
        return text in {'1', 'true', 'yes', 'y', 't'}

    def as_int_loose(v):
        try:
            return int(v)
        except Exception:
            text = str(v or '')
            match = re.search(r'\d+', text)
            return int(match.group(0)) if match else 0

    def as_bool(v):
        text = str(v or '').strip().lower()
        return text in {'1', 'true', 'yes', 'y', 't'}

    def as_percentage(v):
        try:
            value = float(v)
        except Exception:
            return 0.0
        if value < 0:
            return 0.0
        if value > 100:
            return 100.0
        return round(value, 2)

    session_ids = {str(r.get('session_id') or '') for r in row_dicts if r.get('session_id')}
    checklist_by_session = _load_checklist_map(session_ids)
    date_values = {str(r.get('date') or '') for r in row_dicts if r.get('date')}
    all_session_student_ids = set()
    for r in row_dicts:
        for sid in _extract_lms_student_ids(r.get('lms_students')):
            all_session_student_ids.add(str(sid))
    attendance_presence_by_student_date = _load_attendance_presence_by_student_date(
        all_session_student_ids,
        date_values,
    )

    sessions_data = []
    for idx, row in enumerate(row_dicts, start=1):
        session_id = str(row.get('session_id') or '')
        checklist_items = checklist_by_session.get(session_id, [])
        duration_text = str(row.get('duration') or '').strip()
        duration_minutes = _parse_duration_to_minutes(duration_text)

        if checklist_items:
            met = sum(1 for c in checklist_items if c['status'] == 'Met')
            partial = sum(1 for c in checklist_items if c['status'] == 'Partial')
            not_met = sum(1 for c in checklist_items if c['status'] == 'Not Met')
        else:
            met = as_int(row.get('met_count'))
            partial = as_int(row.get('partial_count'))
            not_met = as_int(row.get('not_met_count'))

        session_date = str(row.get('date') or '')
        session_module = (
            row.get('lms_module')
            or row.get('LMS_Module')
            or row.get('module')
            or ''
        )
        session_student_ids = _extract_lms_student_ids(row.get('lms_students'))
        attended_students = 0
        if session_date and session_student_ids:
            attendance_modules_by_student = {}
            for sid in session_student_ids:
                attendance_modules_by_student[str(sid)] = attendance_presence_by_student_date.get(
                    (str(sid), session_date),
                    [],
                )
            dominant_module_key = _select_dominant_attendance_module(
                session_module,
                attendance_modules_by_student,
            )
            if dominant_module_key:
                for module_keys in attendance_modules_by_student.values():
                    if dominant_module_key in module_keys:
                        attended_students += 1
            else:
                for module_keys in attendance_modules_by_student.values():
                    if module_keys:
                        attended_students += 1
        if duration_minutes <= 0:
            attended_students = 0

        engaged_speaker_count = as_int(
            row.get('engaged_speaker_count')
            or row.get('engaged_speakers_count')
            or row.get('engaged_speakers')
        )

        raw_trainer = str(row.get('trainer') or '').strip()
        trainer_text_norm = re.sub(r'\s+', ' ', _simplify_qa_trainer_name(raw_trainer)).strip().lower()
        trainer_not_delivered = trainer_text_norm in {
            'session not delivered',
            'not delivered',
            'session cancelled',
            'session canceled',
            'cancelled',
            'canceled',
        }

        # Do not mark as covered for very short/non-delivered sessions.
        owner_doctor = _infer_row_owner_doctor(row, doctor_names)

        if duration_minutes < 10 or trainer_not_delivered:
            delivered_by = ''
        else:
            delivered_by = _extract_covering_doctor_name(raw_trainer, owner_doctor, doctor_names)

        is_covered_session = bool(delivered_by)

        session_row = {
            'id': row.get('session_id') or row.get('meeting_id') or idx,
            'session_date': str(row.get('date')) if row.get('date') else None,
            'duration_text': duration_text,
            'duration_minutes': duration_minutes,
            'trainer': raw_trainer or doctor_name,
            'owner_doctor': owner_doctor,
            'covered_by': delivered_by if is_covered_session else '',
            'is_covered_session': is_covered_session,
            'cancelled_session': as_bool(row.get('cancelled_session')),
            'subject': row.get('subject') or module_name,
            'engagement': as_percentage(row.get('Engagement')),
            'students_count': as_int(row.get('lms_students_count')),
            'attended_students': attended_students,
            'engaged_speaker_count': engaged_speaker_count,
            'met_count': met,
            'partial_count': partial,
            'not_met_count': not_met,
            'criteria_status': _criteria_status(met),
            'checklist': checklist_items,
        }
        sessions_data.append(session_row)

    if status_filter:
        if status_filter == 'Fully Achieved':
            sessions_data = [s for s in sessions_data if s['met_count'] >= 12]
        elif status_filter == 'Partially Achieved':
            sessions_data = [s for s in sessions_data if 9 <= s['met_count'] < 12]
        elif status_filter == 'Needs Improvement':
            sessions_data = [s for s in sessions_data if s['met_count'] < 9]

    total_sessions = len(sessions_data)
    achieved_sessions = sum(1 for s in sessions_data if s['met_count'] >= 12)
    achievement_percentage = (achieved_sessions / total_sessions * 100) if total_sessions > 0 else 0
    total_activities = len({(s['subject'] or '').strip() for s in sessions_data if (s['subject'] or '').strip()})
    avg_duration = (sum(s['duration_minutes'] for s in sessions_data) / total_sessions) if total_sessions else 0
    avg_met = (sum(s['met_count'] for s in sessions_data) / total_sessions) if total_sessions else 0
    sum_partial = sum(s['partial_count'] for s in sessions_data)
    sum_not_met = sum(s['not_met_count'] for s in sessions_data)
    last_session_date = max((s['session_date'] for s in sessions_data if s['session_date']), default=None)
    total_students = max((as_int(r.get('lms_students_count')) for r in row_dicts), default=0)

    by_date = defaultdict(list)
    for s in sessions_data:
        if s['session_date']:
            by_date[s['session_date']].append(s)
    achievement_over_time = []
    for date_key in sorted(by_date.keys()):
        bucket = by_date[date_key]
        achieved = sum(1 for s in bucket if s['met_count'] >= 12)
        rate = (achieved / len(bucket) * 100) if bucket else 0
        achievement_over_time.append({'date': date_key, 'rate': round(rate, 2)})

    student_engagement = [
        {
            'session': s.get('subject') or f"Session {idx + 1}",
            'date': s.get('session_date'),
            'engagement': as_percentage(s.get('engagement')),
            'attendance': as_int(s.get('attended_students')),
            'engaged_speaker_count': as_int(s.get('engaged_speaker_count')),
        }
        for idx, s in enumerate(
            sorted(
                (s for s in sessions_data if s.get('session_date')),
                key=lambda x: x.get('session_date')
            )
        )
    ]

    return Response({
        'doctor': {'id': doctor_key, 'name': doctor_name},
        'group': {'id': group_key, 'name': group_name, 'total_students': total_students},
        'module': {'id': selected_module_key, 'name': module_name, 'code': 'ALL' if selected_module_key == 0 else ''},
        'kpis': {
            'total_sessions': total_sessions,
            'achieved_sessions': achieved_sessions,
            'achievement_percentage': round(achievement_percentage, 2),
            'total_students': total_students,
            'total_activities': total_activities,
            'avg_duration': round(avg_duration, 2),
            'avg_met': round(avg_met, 2),
            'sum_partial': sum_partial,
            'sum_not_met': sum_not_met,
            'last_session_date': last_session_date,
        },
        'charts': {
            'totals': {
                'met': sum(s['met_count'] for s in sessions_data),
                'partial': sum_partial,
                'not_met': sum_not_met,
            },
            'achieved_rate_over_time': achievement_over_time,
            'student_engagement': student_engagement,
        },
        'sessions': sessions_data,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def get_tutors_summary(request):
    """Summary across all tutors using the same counting logic as doctor dashboard."""
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')
    cancelled_filter = str(request.GET.get('cancelled_filter') or '').strip().lower()

    try:
        doctor_by_id, _, _ = _load_kbc_dimensions()
        groups_by_doctor_id = _load_qa_subject_groups_by_doctor(doctor_by_id)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    doctor_id_by_name = {name: doctor_id for doctor_id, name in doctor_by_id.items()}

    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
    qa_table_q = f'"{qa_schema}"."{qa_table}"'

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT *
                FROM {qa_table_q}
                ORDER BY date DESC NULLS LAST
                """
            )
            all_rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def as_int(v):
        try:
            return int(v or 0)
        except Exception:
            return 0

    def as_bool(v):
        text = str(v or '').strip().lower()
        return text in {'1', 'true', 'yes', 'y', 't'}

    doctor_names_all = list(doctor_by_id.values())
    doctor_group_names_by_name = {
        doctor_name: [
            re.sub(r'\s+', ' ', str(g.get('name') or '').strip())
            for g in groups_by_doctor_id.get(doctor_id, [])
            if g.get('name')
        ]
        for doctor_id, doctor_name in doctor_by_id.items()
    }

    def _normalize_subject_match_text(value):
        text = _clean_subject_for_group(value)
        return re.sub(r'\s+', ' ', text).strip()

    def _subject_matches_group(subject_value, group_value):
        subject_text = _normalize_subject_match_text(subject_value)
        selected_text = _normalize_subject_match_text(group_value)
        if not subject_text or not selected_text:
            return False
        return subject_text.lower() == selected_text.lower()

    def _infer_summary_owner_doctor(row):
        owner = _infer_row_owner_doctor(row, doctor_names_all)
        if owner:
            return owner

        matched_doctors = [
            doctor_name
            for doctor_name, group_names in doctor_group_names_by_name.items()
            if any(_subject_matches_group(row.get('subject'), group_name) for group_name in group_names)
        ]
        if len(matched_doctors) == 1:
            return matched_doctors[0]
        return None

    row_dicts = [dict(zip(columns, row)) for row in all_rows]
    if date_from:
        row_dicts = [r for r in row_dicts if str(r.get('date') or '') >= date_from]
    if date_to:
        row_dicts = [r for r in row_dicts if str(r.get('date') or '') <= date_to]
    if cancelled_filter == 'cancelled':
        row_dicts = [r for r in row_dicts if as_bool(r.get('cancelled_session'))]
    elif cancelled_filter == 'not_cancelled':
        row_dicts = [r for r in row_dicts if not as_bool(r.get('cancelled_session'))]

    session_ids = {str(r.get('session_id') or '').strip() for r in row_dicts if r.get('session_id')}
    checklist_by_session = _load_checklist_map(session_ids)

    trainers = []
    checklist_code_stats = defaultdict(
        lambda: {'met': 0, 'partial': 0, 'not_met': 0, 'total': 0, 'order': None, 'label': ''}
    )
    checklist_code_not_met_by_doctor = defaultdict(
        lambda: defaultdict(lambda: {'count': 0, 'sessions': []})
    )
    checklist_code_partial_by_doctor = defaultdict(
        lambda: defaultdict(lambda: {'count': 0, 'sessions': []})
    )
    checklist_code_not_met_unmapped = defaultdict(lambda: {'count': 0, 'sessions': []})
    checklist_code_partial_unmapped = defaultdict(lambda: {'count': 0, 'sessions': []})
    evidence_with = 0
    evidence_without = 0

    prepared_rows = []
    for row in row_dicts:
        session_id = str(row.get('session_id') or '').strip()
        checklist_items = checklist_by_session.get(session_id, [])
        owner_doctor = _infer_summary_owner_doctor(row)
        session_date = str(row.get('date') or '')
        session_subject = str(
            row.get('subject')
            or row.get('hg_subject')
            or row.get('lms_module')
            or row.get('module')
            or ''
        ).strip()
        duration_text = str(row.get('duration') or '').strip()
        duration_minutes = _parse_duration_to_minutes(duration_text)
        raw_trainer = str(row.get('trainer') or '').strip()
        trainer_text_norm = re.sub(r'\s+', ' ', _simplify_qa_trainer_name(raw_trainer)).strip().lower()
        trainer_not_delivered = trainer_text_norm in {
            'session not delivered',
            'not delivered',
            'session cancelled',
            'session canceled',
            'cancelled',
            'canceled',
        }
        if duration_minutes < 10 or trainer_not_delivered:
            delivered_by = ''
        else:
            delivered_by = _extract_covering_doctor_name(raw_trainer, owner_doctor, doctor_names_all)
        is_covered_session = bool(delivered_by)

        if checklist_items:
            met = sum(1 for c in checklist_items if c['status'] == 'Met')
            partial = sum(1 for c in checklist_items if c['status'] == 'Partial')
            not_met = sum(1 for c in checklist_items if c['status'] == 'Not Met')
        else:
            met = as_int(row.get('met_count'))
            partial = as_int(row.get('partial_count'))
            not_met = as_int(row.get('not_met_count'))

        prepared_rows.append(
            {
                'row': row,
                'session_id': session_id,
                'session_date': session_date,
                'session_subject': session_subject or 'Unknown Subject',
                'owner_doctor': owner_doctor,
                'covered_by': delivered_by if is_covered_session else '',
                'effective_doctor': delivered_by if is_covered_session else owner_doctor,
                'is_covered_session': is_covered_session,
                'cancelled_session': as_bool(row.get('cancelled_session')),
                'checklist_items': checklist_items,
                'met': met,
                'partial': partial,
                'not_met': not_met,
            }
        )

    active_rows = [item for item in prepared_rows if not item['cancelled_session']]
    total_sessions_all = len(active_rows)
    total_met_all = 0
    total_partial_all = 0
    total_not_met_all = 0

    for item in active_rows:
        checklist_items = item['checklist_items']
        effective_doctor = item['effective_doctor']
        session_id = item['session_id']
        session_date = item['session_date']
        session_subject = item['session_subject']

        total_met_all += item['met']
        total_partial_all += item['partial']
        total_not_met_all += item['not_met']

        if checklist_items:
            for checklist_item in checklist_items:
                code = checklist_item.get('code')
                if not code:
                    continue
                checklist_code_stats[code]['total'] += 1
                if checklist_item['status'] == 'Met':
                    checklist_code_stats[code]['met'] += 1
                elif checklist_item['status'] == 'Partial':
                    checklist_code_stats[code]['partial'] += 1
                    if effective_doctor:
                        doctor_payload = checklist_code_partial_by_doctor[code][effective_doctor]
                        doctor_payload['count'] += 1
                        doctor_payload['sessions'].append(
                            {
                                'session_id': session_id or None,
                                'date': session_date or None,
                                'subject': session_subject,
                            }
                        )
                    else:
                        unmapped_payload = checklist_code_partial_unmapped[code]
                        unmapped_payload['count'] += 1
                        unmapped_payload['sessions'].append(
                            {
                                'session_id': session_id or None,
                                'date': session_date or None,
                                'subject': session_subject,
                            }
                        )
                else:
                    checklist_code_stats[code]['not_met'] += 1
                    if effective_doctor:
                        doctor_payload = checklist_code_not_met_by_doctor[code][effective_doctor]
                        doctor_payload['count'] += 1
                        doctor_payload['sessions'].append(
                            {
                                'session_id': session_id or None,
                                'date': session_date or None,
                                'subject': session_subject,
                            }
                        )
                    else:
                        unmapped_payload = checklist_code_not_met_unmapped[code]
                        unmapped_payload['count'] += 1
                        unmapped_payload['sessions'].append(
                            {
                                'session_id': session_id or None,
                                'date': session_date or None,
                                'subject': session_subject,
                            }
                        )

                item_order = checklist_item.get('order')
                current_order = checklist_code_stats[code]['order']
                if item_order is not None and (current_order is None or item_order < current_order):
                    checklist_code_stats[code]['order'] = item_order

                if not checklist_code_stats[code]['label']:
                    item_label = str(checklist_item.get('item') or '').strip()
                    checklist_code_stats[code]['label'] = item_label.split(':')[0].strip() if item_label else code

                if checklist_item.get('has_evidence'):
                    evidence_with += 1
                else:
                    evidence_without += 1

    # Use same doctor matching strategy as get_dashboard_data (token intersection).
    doctor_names = list(doctor_by_id.values())
    for doctor_name in doctor_by_id.values():
        doctor_rows = [item for item in active_rows if item['effective_doctor'] == doctor_name]

        if not doctor_rows:
            continue

        sessions_count = 0
        full_met_sessions = 0
        met_total = 0
        partial_total = 0
        not_met_total = 0
        last_session_date = None

        for item in doctor_rows:
            sessions_count += 1
            met = item['met']
            partial = item['partial']
            not_met = item['not_met']

            met_total += met
            partial_total += partial
            not_met_total += not_met
            if met >= 12 and partial == 0 and not_met == 0:
                full_met_sessions += 1

            session_date = item['session_date']
            if session_date and (not last_session_date or session_date > last_session_date):
                last_session_date = session_date

        observations = met_total + partial_total + not_met_total
        compliance_rate = (met_total / observations * 100) if observations > 0 else 0
        trainers.append(
            {
                'name': doctor_name,
                'sessions_count': sessions_count,
                'full_met_sessions': full_met_sessions,
                'observations': observations,
                'met': met_total,
                'partial': partial_total,
                'not_met': not_met_total,
                'compliance_rate': round(compliance_rate, 2),
                'last_session_date': last_session_date,
            }
        )

    trainers.sort(key=lambda x: (x['observations'], x['met']), reverse=True)

    total_met = total_met_all
    total_partial = total_partial_all
    total_not_met = total_not_met_all
    total_observations = total_met + total_partial + total_not_met
    overall_compliance = (total_met / total_observations * 100) if total_observations > 0 else 0
    evidence_total = evidence_with + evidence_without
    evidence_coverage = (evidence_with / evidence_total * 100) if evidence_total > 0 else 0
    cancelled_sessions = sorted(
        [
            {
                'doctor_id': doctor_id_by_name.get(item['owner_doctor'] or ''),
                'doctor_name': item['owner_doctor'] or 'Unknown Doctor',
                'date': item['session_date'] or None,
                'subject': item['session_subject'] or 'Unknown Subject',
                'session_id': item['session_id'] or None,
                'trainer': str(item['row'].get('trainer') or '').strip() or None,
            }
            for item in prepared_rows
            if item['cancelled_session']
        ],
        key=lambda x: ((x.get('date') or ''), (x.get('doctor_name') or ''), (x.get('subject') or '')),
        reverse=True,
    )

    checklist_stats = []
    for code, stat in checklist_code_stats.items():
        total = stat['total'] or 1
        met_rate = stat['met'] / total * 100
        partial_rate = stat['partial'] / total * 100
        not_met_rate = stat['not_met'] / total * 100
        open_count = stat['partial'] + stat['not_met']
        open_rate = open_count / total * 100
        checklist_stats.append(
            {
                'code': code,
                'label': stat['label'] or code,
                'order': stat['order'],
                'met': stat['met'],
                'partial': stat['partial'],
                'not_met': stat['not_met'],
                'total': stat['total'],
                'met_rate': round(met_rate, 2),
                'partial_rate': round(partial_rate, 2),
                'not_met_rate': round(not_met_rate, 2),
                'open_count': open_count,
                'open_rate': round(open_rate, 2),
                'not_met_by_doctor': [
                    {
                        'id': doctor_id_by_name.get(doctor_name),
                        'name': doctor_name,
                        'count': payload['count'],
                        'sessions': sorted(
                            payload['sessions'],
                            key=lambda x: (x.get('date') or ''),
                            reverse=True,
                        ),
                    }
                    for doctor_name, payload in sorted(
                        checklist_code_not_met_by_doctor.get(code, {}).items(),
                        key=lambda x: x[1]['count'],
                        reverse=True,
                    )
                ],
                'not_met_unmapped': {
                    'count': checklist_code_not_met_unmapped.get(code, {}).get('count', 0),
                    'sessions': sorted(
                        checklist_code_not_met_unmapped.get(code, {}).get('sessions', []),
                        key=lambda x: (x.get('date') or ''),
                        reverse=True,
                    ),
                },
                'partial_by_doctor': [
                    {
                        'id': doctor_id_by_name.get(doctor_name),
                        'name': doctor_name,
                        'count': payload['count'],
                        'sessions': sorted(
                            payload['sessions'],
                            key=lambda x: (x.get('date') or ''),
                            reverse=True,
                        ),
                    }
                    for doctor_name, payload in sorted(
                        checklist_code_partial_by_doctor.get(code, {}).items(),
                        key=lambda x: x[1]['count'],
                        reverse=True,
                    )
                ],
                'partial_unmapped': {
                    'count': checklist_code_partial_unmapped.get(code, {}).get('count', 0),
                    'sessions': sorted(
                        checklist_code_partial_unmapped.get(code, {}).get('sessions', []),
                        key=lambda x: (x.get('date') or ''),
                        reverse=True,
                    ),
                },
            }
        )

    checklist_stats.sort(key=lambda x: (x['order'] is None, x['order'] if x['order'] is not None else 999, x['code']))

    # Strengths: highest met rate first.
    strengths = sorted(
        checklist_stats,
        key=lambda x: (x['met_rate'], -x['not_met_rate'], x['met']),
        reverse=True,
    )
    top_strength_codes = {item['code'] for item in strengths[:6]}

    # Improvements: lowest met rate first, excluding strengths to avoid overlap.
    improvements_pool = [item for item in checklist_stats if item['code'] not in top_strength_codes]
    improvements = sorted(
        improvements_pool,
        key=lambda x: (x['met_rate'], -x['not_met_rate'], -x['met']),
    )
    open_actions = sorted(checklist_stats, key=lambda x: (x['open_count'], x['open_rate']), reverse=True)

    dates = [str(r.get('date') or '') for r in row_dicts if r.get('date')]
    period = {'from': min(dates) if dates else None, 'to': max(dates) if dates else None}

    return Response(
        {
            'period': period,
            'totals': {
                'total_sessions': total_sessions_all,
                'matched_sessions': sum(t['sessions_count'] for t in trainers),
                'compliance_rate': round(overall_compliance, 2),
                'met': total_met,
                'partial': total_partial,
                'not_met': total_not_met,
                'observations': total_observations,
                'trainers_count': len(trainers),
                'evidence_with': evidence_with,
                'evidence_without': evidence_without,
                'evidence_coverage_rate': round(evidence_coverage, 2),
            },
            'trainers': trainers,
            'checklist_stats': checklist_stats,
            'strengths': strengths[:6],
            'improvements': improvements[:6],
            'open_actions': open_actions[:5],
            'cancelled_sessions': cancelled_sessions,
        }
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def get_session_report(request):
    """
    Return detailed QA observation report payload for a single session.
    Sources:
      - qa_doctors_sessions (session-level fields)
      - qa_doctors_checklist_items (12 checklist + evidence)
    """
    session_id = str(request.GET.get('session_id') or '').strip()
    if not session_id:
        return Response({'error': 'session_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
    qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
    qa_table_q = f'"{qa_schema}"."{qa_table}"'

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT *
                FROM {qa_table_q}
                WHERE CAST(session_id AS text) = %s
                ORDER BY date DESC NULLS LAST
                LIMIT 1
                """,
                [session_id],
            )
            row = cursor.fetchone()
            if not row:
                return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
            columns = [col[0] for col in cursor.description]
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    session_row = dict(zip(columns, row))
    checklist_items = _load_checklist_map({session_id}).get(session_id, [])

    def _text(v, default=''):
        if v is None:
            return default
        value = str(v).strip()
        return value if value else default

    def _as_bool(v):
        if isinstance(v, bool):
            return v
        return str(v or '').strip().lower() in {'1', 'true', 't', 'yes', 'y'}

    def _as_json(v):
        if v is None:
            return {}
        if isinstance(v, (dict, list)):
            return v
        text = str(v).strip()
        if not text:
            return {}
        try:
            return json.loads(text)
        except Exception:
            return {'raw': text}

    def _as_text(value):
        """
        Convert scalar/dict/list into readable plain text (no JSON formatting in UI).
        """
        if value is None:
            return ''
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (int, float, bool)):
            return str(value)
        if isinstance(value, list):
            parts = []
            for item in value:
                text = _as_text(item)
                if text:
                    parts.append(text)
            return '\n'.join(parts)
        if isinstance(value, dict):
            parts = []
            for key, val in value.items():
                text = _as_text(val)
                if text:
                    parts.append(f"{key}: {text}")
            return '\n'.join(parts)
        return str(value).strip()

    def _pick_row_value(row_obj, col_names):
        for col in col_names:
            if col in row_obj and row_obj.get(col) not in (None, ''):
                return row_obj.get(col)
        return None

    cancelled_session = _as_bool(session_row.get('cancelled_session'))
    teaching_quality_comment_raw = _pick_row_value(
        session_row,
        ['teaching_quality_comments', 'teaching_quality_comment'],
    )
    safeguarding_status_raw = _pick_row_value(
        session_row,
        ['safeguarding_status', 'safegarding_status'],
    )
    safeguarding_comment_raw = _pick_row_value(
        session_row,
        ['safeguarding_comments', 'safeguarding_comment', 'safegarding_comment'],
    )

    observed = len(checklist_items) > 0 or any(
        _text(v)
        for v in [
            session_row.get('overall_judgement'),
            teaching_quality_comment_raw,
            safeguarding_status_raw,
            safeguarding_comment_raw,
            session_row.get('areas_for_development'),
        ]
    ) or session_row.get('teaching_quality_rating') is not None
    if cancelled_session:
        observation_status = 'Not Delivered / Cancelled'
    elif observed:
        observation_status = 'Observed'
    else:
        observation_status = 'Scheduled / No Observation'

    met_count = sum(1 for item in checklist_items if item.get('status') == 'Met')
    partial_count = sum(1 for item in checklist_items if item.get('status') == 'Partial')
    not_met_count = sum(1 for item in checklist_items if item.get('status') == 'Not Met')

    # Build text fields for report categories (plain text, not JSON).
    duration_score_val = _pick_row_value(
        session_row,
        ['duration_score', 'duration_rating', 'session_duration_score'],
    )
    ksbs_covered_val = _pick_row_value(
        session_row,
        ['ksbs_covered', 'ksb_covered', 'ksb_coverage', 'ksbs_coverage', 'ksb_evaluation'],
    )
    strengths_val = _pick_row_value(session_row, ['strengths', 'key_strengths'])
    areas_for_development_val = session_row.get('areas_for_development')
    overall_judgement_val = session_row.get('overall_judgement')

    met_items_labels = [
        str(item.get('item') or item.get('code') or '').split(':')[0].strip()
        for item in checklist_items
        if item.get('status') == 'Met'
    ]
    partial_items_labels = [
        str(item.get('item') or item.get('code') or '').split(':')[0].strip()
        for item in checklist_items
        if item.get('status') == 'Partial'
    ]
    not_met_items_labels = [
        str(item.get('item') or item.get('code') or '').split(':')[0].strip()
        for item in checklist_items
        if item.get('status') == 'Not Met'
    ]

    engaged_speakers_count_val = _pick_row_value(
        session_row,
        ['engaged_speakers_count', 'engaged_speaker_count', 'engaged_speakers'],
    )
    engaged_val = _pick_row_value(
        session_row,
        ['engaged_speakers_count', 'engaged_speaker_count', 'engaged_speakers', 'engaged_learners', 'active_learners'],
    )
    engagement_val = session_row.get('Engagement')
    learner_engagement_text = []
    if engaged_val not in (None, ''):
        learner_engagement_text.append(f"Actively engaged: {engaged_val}")
    if engagement_val not in (None, ''):
        learner_engagement_text.append(f"Engagement rate: {engagement_val}%")

    quality_eval_text = _text(session_row.get('teaching_quality_rating'))
    quality_comment_text = _text(teaching_quality_comment_raw)
    safeguarding_eval_text = _text(safeguarding_status_raw)
    safeguarding_comment_text = _text(safeguarding_comment_raw)

    qa_checklist_text = (
        f"{met_count} Pass | {partial_count} Partial | {not_met_count} Not Met"
        + (
            f"\nPass: {', '.join([x for x in met_items_labels if x])}" if met_items_labels else ''
        )
        + (
            f"\nPartial: {', '.join([x for x in partial_items_labels if x])}" if partial_items_labels else ''
        )
        + (
            f"\nNot Met: {', '.join([x for x in not_met_items_labels if x])}" if not_met_items_labels else ''
        )
    )

    if not strengths_val:
        strengths_val = ', '.join([x for x in met_items_labels if x]) if met_items_labels else ''

    return Response(
        {
            'session': {
                'session_id': session_id,
                'date': _text(session_row.get('date')),
                'subject': _text(session_row.get('subject')) or _text(session_row.get('hg_subject')) or _text(session_row.get('lms_module')),
                'trainer': _text(session_row.get('trainer')),
                'duration': _text(session_row.get('duration')),
                'engagement': session_row.get('Engagement'),
                'lms_module': _text(session_row.get('lms_module')) or _text(session_row.get('LMS_Module')) or _text(session_row.get('module')),
                'lms_students_count': session_row.get('lms_students_count') or 0,
                'meeting_id': _text(session_row.get('meeting_id')),
                'observation_status': observation_status,
                'cancelled_session': cancelled_session,
                'engaged_speakers_count': int(engaged_speakers_count_val) if str(engaged_speakers_count_val or '').strip().isdigit() else None,
            },
            'qa_observation': {
                'overall_judgement': _text(session_row.get('overall_judgement')),
                'teaching_quality_rating': session_row.get('teaching_quality_rating'),
                'teaching_quality_comment': _text(teaching_quality_comment_raw),
                'safeguarding_status': _text(safeguarding_status_raw),
                'safeguarding_comment': _text(safeguarding_comment_raw),
                'areas_for_development': _as_json(session_row.get('areas_for_development')),
            },
            'observation_flags': {
                'observed': observed and not cancelled_session,
                'cancelled': cancelled_session,
                'pending': (not observed) and (not cancelled_session),
            },
            'source_columns': {
                'overall_judgement': 'qa_doctors_sessions.overall_judgement',
                'teaching_quality_rating': 'qa_doctors_sessions.teaching_quality_rating',
                'teaching_quality_comment': 'qa_doctors_sessions.teaching_quality_comments OR qa_doctors_sessions.teaching_quality_comment',
                'safeguarding_status': 'qa_doctors_sessions.safeguarding_status OR qa_doctors_sessions.safegarding_status',
                'safeguarding_comment': 'qa_doctors_sessions.safeguarding_comments OR qa_doctors_sessions.safeguarding_comment OR qa_doctors_sessions.safegarding_comment',
                'areas_for_development': 'qa_doctors_sessions.areas_for_development',
                'cancelled_session': 'qa_doctors_sessions.cancelled_session',
                'checklist_items': 'qa_doctors_checklist_items.*',
            },
            'checklist_summary': {
                'met': met_count,
                'partial': partial_count,
                'not_met': not_met_count,
                'total': len(checklist_items),
                'compliance_rate': round((met_count / len(checklist_items) * 100), 2) if checklist_items else 0,
            },
            'report_text_sections': {
                'duration_score': _as_text(duration_score_val),
                'ksbs_covered': _as_text(ksbs_covered_val),
                'quality_of_teaching_evaluation': quality_eval_text,
                'quality_of_teaching_comments': quality_comment_text,
                'learner_engagement': '\n'.join(learner_engagement_text).strip(),
                'safeguarding_evaluation': safeguarding_eval_text,
                'safeguarding_comments': safeguarding_comment_text,
                'qa_checklist': qa_checklist_text.strip(),
                'strengths': _as_text(strengths_val),
                'areas_for_development': _as_text(_as_json(areas_for_development_val)),
                'overall_judgement': _as_text(overall_judgement_val),
            },
            'checklist_items': checklist_items,
        }
    )

