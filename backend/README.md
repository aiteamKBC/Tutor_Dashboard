# Doctor Dashboard Backend - Django REST API

## QA dashboard data and reconciliation

The active `/api/tutor/*` dashboard reads `qa_doctors_sessions` and
`qa_doctors_checklist_items`. The Django `Session`/`Group` models belong to the
separate `/api/doctor/*` endpoints; their IDs must not be passed to the QA API.
QA doctor, group and module IDs are stable numeric hashes of their normalized
identities. Refresh existing dashboard selections after upgrading from positional IDs.

A scheduled owner and the delivering tutor are separate. Explicit subject/module
names, confirmed exact-title ownership in `QA_SUBJECT_OWNER_OVERRIDES`, and explicit
"covering for" annotations identify the owner. An unnamed cohort with only one
known owner can inherit that owner across all dates, including cancellations.
Shared unnamed subjects are never assigned an owner by majority vote. Unassigned
cancellations remain visible to the cohort's tutors without receiving delivery credit.
Co-facilitation notes preserve the primary trainer rather than turning an assistant
into a replacement. Raw trainer text remains available in the session/report.

Total Sessions includes listed coverage and cancellations. Adjusted Sessions counts
each delivered, non-cancelled session for its effective tutor only. Doctor metrics,
overview reports, charts and the tutor summary use that same credited set. Compliance
is Met / (Met + Partial + Not Met), using the actual visible checklist; Safeguarding
remains excluded. Missing criteria are not invented as failures. A checklist with all
recorded criteria Met is Fully Achieved; zero recorded criteria is Not Evaluated.
NULL engagement remains unavailable instead of being interpreted as zero percent.

Run the production-data reconciliation without changing database records:

```powershell
.\.venv\Scripts\python.exe manage.py audit_qa_sessions --output ../reports/qa-audit.json
```

This reads both QA tables in a read-only repeatable-read transaction, replays the
dashboard/summary/group endpoints over that snapshot, and fails if a session is
hidden, credited twice, missing, or disagrees with summary checklist totals. Attendance
and ticket writes are outside this audit. Its optional report contains aggregate
metrics and the Amgad cohort attribution, without student rosters or checklist evidence.

## Project Structure

```
backend/
├── doctor_dashboard/          # Main project settings
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── accounts/                  # User authentication & profiles
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   └── urls.py
├── academics/                 # Modules, Groups, Students
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   └── urls.py
├── sessions/                  # Session management
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   └── urls.py
├── evidence/                  # Evidence upload & review
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   └── urls.py
├── manage.py
└── requirements.txt
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Database

Update `doctor_dashboard/settings.py` with your PostgreSQL credentials:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'doctor_dashboard',
        'USER': 'postgres',
        'PASSWORD': 'your_password',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

### 3. Run Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### 4. Create Superuser

```bash
python manage.py createsuperuser
```

### 5. Load Demo Data

```bash
python manage.py seed_data
```

### 6. Run Development Server

```bash
python manage.py runserver
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh JWT token

### Doctor Dashboard
- `GET /api/doctor/me` - Get current doctor profile
- `GET /api/doctor/summary` - Get KPI summary (with date filters)
- `GET /api/doctor/modules` - Get modules with groups
- `GET /api/doctor/groups/{id}/students` - Get students in a group
- `GET /api/doctor/sessions` - Get sessions (with filters)

### Evidence
- `POST /api/evidence/upload` - Upload evidence file
- `GET /api/evidence` - Get evidence list (filter by session_id)
- `PATCH /api/evidence/{id}` - Update evidence status (QA/Admin only)

## Data Models

### User (accounts.User)
- Extends AbstractUser
- Fields: email, role (admin/doctor/qa)

### DoctorProfile (accounts.DoctorProfile)
- user (FK to User)
- display_name
- title

### Module (academics.Module)
- name
- code

### Group (academics.Group)
- module (FK)
- name
- doctor (FK to DoctorProfile)
- start_date, end_date

### Student (academics.Student)
- full_name, email
- group (FK)
- active (boolean)

### Session (sessions.Session)
- group, module, doctor (FKs)
- subject, session_date, duration_minutes
- met_count, partial_count, not_met_count
- Computed: criteria_status

### Evidence (evidence.Evidence)
- session (FK)
- uploaded_by (FK to User)
- file (FileField)
- status (pending/approved/rejected)
- notes

## Docker Deployment

See `docker-compose.yml` in the root directory for full-stack deployment.

```bash
docker-compose up --build
```

This will start:
- PostgreSQL database
- Django backend (port 8000)
- React frontend (port 5173)
