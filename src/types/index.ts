export interface DoctorSummary {
  total_sessions: number;
  avg_duration: number;
  avg_met: number;
  achieved_rate: number;
  total_evidence: number;
  pending_evidence: number;
}

export interface Module {
  id: string;
  name: string;
  code?: string;
  groups?: Group[];
}

export interface Group {
  id: string;
  name: string;
  module_id: string;
  doctor_id: string;
  start_date: string;
  end_date: string;
  students_count?: number;
  total_sessions?: number;
  achieved_sessions?: number;
}

export interface Student {
  id: string;
  full_name: string;
  email: string;
  group_id: string;
  active: boolean;
  attendance_rate?: number;
  evidence_status?: string;
}

export interface Session {
  id: string;
  group_id: string;
  module_id: string;
  doctor_id: string;
  subject: string;
  session_date: string;
  duration_minutes: number;
  met_count: number;
  partial_count: number;
  not_met_count: number;
  criteria_status: string;
  evidence_count?: number;
  evidence_status?: string;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  session_id: string;
  uploaded_by: string;
  file?: string;
  url?: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface TutorDashboardData {
  doctor: {
    id: number;
    name: string;
  };
  group: {
    id: number;
    name: string;
    total_students: number;
  };
  module: {
    id: number;
    name: string;
    code?: string;
  };
  kpis: {
    total_sessions: number;
    achieved_sessions: number;
    achievement_percentage: number;
    total_students: number;
    total_activities: number;
    avg_duration: number;
    avg_met: number;
    sum_partial: number;
    sum_not_met: number;
    last_session_date: string | null;
  };
  charts: {
    totals: {
      met: number;
      partial: number;
      not_met: number;
    };
    achieved_rate_over_time: Array<{
      date: string;
      rate: number;
    }>;
    student_engagement?: Array<{
      session: string;
      date: string;
      engagement: number;
      attendance?: number;
      engaged_speaker_count?: number;
    }>;
    monthly_engagement?: Array<{
      month: string;
      avgAttendance: number;
      avgParticipation: number;
      avgQuestions: number;
    }>;
  };
  sessions: Array<{
    id: number;
    session_date: string;
    duration_text?: string;
    duration_minutes: number;
    trainer: string;
    owner_doctor?: string;
    covered_by?: string;
    is_covered_session?: boolean;
    cancelled_session?: boolean;
    subject: string;
    students_count: number;
    attended_students?: number;
    engaged_speaker_count?: number;
    engaged_speakers_count?: number;
    met_count: number;
    partial_count: number;
    not_met_count: number;
    criteria_status: string;
    checklist?: Array<{
      code: string;
      status: 'Met' | 'Partial' | 'Not Met';
      order?: number | null;
      item?: string;
      evidence?: string;
      has_evidence?: boolean;
    }>;
  }>;
}
