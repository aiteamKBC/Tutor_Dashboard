interface SessionAttribution {
  cancelled_session?: boolean;
  effective_doctor?: string | null;
  owner_doctor?: string | null;
  covered_by?: string | null;
  is_covered_session?: boolean;
}

export function isSessionCountedForDoctor(session: SessionAttribution, doctorName: string): boolean {
  if (session.cancelled_session || !doctorName.trim()) return false;

  // The API uses the same canonical doctor names as the dashboard and summary.
  // Older responses can use explicit owner/cover fields, never subject membership.
  const effectiveDoctor = session.effective_doctor !== undefined
    ? session.effective_doctor
    : session.is_covered_session ? session.covered_by : session.owner_doctor;

  return !!effectiveDoctor && effectiveDoctor.trim() === doctorName.trim();
}
