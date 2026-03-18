# Doctor Dashboard Backend - Django REST API

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
