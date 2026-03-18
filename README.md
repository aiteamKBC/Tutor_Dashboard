# Doctor & Tutor Dashboard

A full-stack monitoring dashboard for medical education with two main interfaces:
1. **Doctor Dashboard** - For doctors to manage their groups, sessions, and evidence
2. **Tutor Dashboard** - For tutors to monitor doctor performance with cascading filters

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS
- **Backend**: Django 5 + Django REST Framework
- **Database**: PostgreSQL
- **Auth**: JWT (SimpleJWT) - Optional

## Features

### Tutor Dashboard
- **Cascading Filters**: Doctor → Group → Module
- **Header Summary**: Selected doctor, group, module with achievement KPIs
- **KPI Cards**: 
  - Total Students
  - Total Activities
  - Average Session Duration
  - Average Met Count
  - Sum Partial Count
  - Sum Not Met Count
  - Last Session Date
- **Charts**:
  - Bar chart for Met vs Partial vs Not Met totals
  - Line chart for achievement rate over time
- **Sessions List**: Filterable by date range and status
- **12-Criteria Achievement System**:
  - ✅ Fully Achieved (12/12 met)
  - ⚠️ Partially Achieved (9-11 met)
  - ❌ Needs Improvement (<9 met)

### Doctor Dashboard
- Module and group management
- Session tracking with 12-criteria results
- Evidence upload and review
- Performance analytics

## Quick Start

### Using Docker (Recommended)

```bash
# Start all services
docker-compose up --build

# Run migrations and seed data
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py seed_data

# Access the applications
Frontend: http://localhost:5173
Backend API: http://localhost:8000
```

### Manual Setup

#### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup database
python manage.py migrate
python manage.py seed_data

# Run server
python manage.py runserver
```

#### Frontend Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

## Demo Accounts

After running `seed_data`:

- **Tutor**: tutor@example.com / password123
- **Doctors**: 
  - doctor1@example.com / password123
  - doctor2@example.com / password123
  - doctor3@example.com / password123

## API Endpoints

### Tutor Dashboard APIs

- `GET /api/tutor/doctors` - Get all doctors
- `GET /api/tutor/doctors/{doctor_id}/groups` - Get doctor's groups
- `GET /api/tutor/groups/{group_id}/modules` - Get group's modules
- `GET /api/tutor/dashboard?doctor_id=&group_id=&module_id=&date_from=&date_to=&status=` - Get dashboard data

### Doctor Dashboard APIs

- `GET /api/doctor/me` - Get doctor profile
- `GET /api/doctor/summary` - Get KPIs
- `GET /api/doctor/modules` - Get modules with groups
- `GET /api/doctor/sessions` - Get sessions (filterable)
- `POST /api/evidence/upload` - Upload evidence

## Project Structure

```
├── backend/
│   ├── accounts/          # User & doctor profiles
│   ├── academics/         # Modules, groups, students
│   ├── sessions/          # Session management
│   ├── evidence/          # Evidence upload & review
│   └── tutor_dashboard/   # Tutor monitoring APIs
├── src/
│   ├── pages/
│   │   ├── dashboard/     # Doctor dashboard
│   │   ├── tutor/         # Tutor dashboard
│   │   └── modules/       # Modules overview
│   ├── types/             # TypeScript interfaces
│   └── utils/             # API client
└── docker-compose.yml
```

## Database Models

### Group Model (Updated)
- Many-to-Many relationship with Module
- One group can have multiple modules
- Allows flexible module assignment

### Session Model
- Tracks 12-criteria achievement (met_count, partial_count, not_met_count)
- Computed criteria_status property
- Indexed for performance

## Development

```bash
# Backend
cd backend
python manage.py makemigrations
python manage.py migrate

# Frontend
npm run dev

# Build for production
npm run build
```

## Routes

- `/` - Doctor Dashboard (default)
- `/tutor` - Tutor Dashboard
- `/modules` - Modules Overview

## License

MIT
