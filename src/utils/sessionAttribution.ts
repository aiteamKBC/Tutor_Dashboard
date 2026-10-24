interface SessionAttribution {
  cancelled_session?: boolean;
  effective_doctor?: string | null;
  owner_doctor?: string | null;
  covered_by?: string | null;
  is_covered_session?: boolean;
  is_delivered?: boolean;
}

export function isSessionCountedForDoctor(session: SessionAttribution, doctorName: string): boolean {
  if (session.cancelled_session || session.is_delivered === false || !doctorName.trim()) return false;

  // The API uses the same canonical doctor names as the dashboard and summary.
  // Older responses can use explicit owner/cover fields, never subject membership.
  const effectiveDoctor = session.effective_doctor !== undefined
    ? session.effective_doctor
    : session.is_covered_session ? session.covered_by : session.owner_doctor;

  return !!effectiveDoctor && effectiveDoctor.trim() === doctorName.trim();
}

export function doctorIdentityMatches(left: string, right: string): boolean {
  return !!left.trim() && left.trim() === right.trim();
}

interface SessionMetrics extends SessionAttribution {
  met_count?: number;
  partial_count?: number;
  not_met_count?: number;
  duration_minutes?: number;
}

export function getSessionCompliancePercent(session: SessionMetrics): number {
  const total = Number(session.met_count || 0) + Number(session.partial_count || 0) + Number(session.not_met_count || 0);
  return total ? Math.round(Number(session.met_count || 0) / total * 100) : 0;
}

export function summarizeDoctorSessions(sessions: SessionMetrics[], doctorName: string) {
  const counted = sessions.filter(session => isSessionCountedForDoctor(session, doctorName));
  const totals = counted.reduce((acc, session) => ({
    met: acc.met + Number(session.met_count || 0),
    partial: acc.partial + Number(session.partial_count || 0),
    notMet: acc.notMet + Number(session.not_met_count || 0),
    durationMinutes: acc.durationMinutes + Number(session.duration_minutes || 0),
  }), { met: 0, partial: 0, notMet: 0, durationMinutes: 0 });
  const observations = totals.met + totals.partial + totals.notMet;
  return {
    ...totals,
    count: counted.length,
    observations,
    compliance: observations ? Math.round(totals.met / observations * 100) : 0,
  };
}
