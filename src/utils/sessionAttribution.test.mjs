import assert from 'node:assert/strict';
import test from 'node:test';
import { doctorIdentityMatches, getSessionCompliancePercent, isSessionCountedForDoctor, summarizeDoctorSessions } from './sessionAttribution.ts';

const coveredSession = {
  owner_doctor: 'Sharon Shields',
  covered_by: 'Omar Elshafey',
  effective_doctor: 'Omar Elshafey',
  is_covered_session: true,
};

test('coverage counts once for the delivering tutor, even when listed for both', () => {
  const tutors = ['Sharon Shields', 'Omar Elshafey', 'Nathan Shields'];
  assert.deepEqual(tutors.filter(name => isSessionCountedForDoctor(coveredSession, name)), ['Omar Elshafey']);
});

test('an ordinary session does not count for other tutors sharing its subject or surname', () => {
  const session = { owner_doctor: 'Sharon Shields', effective_doctor: 'Sharon Shields' };
  assert.equal(isSessionCountedForDoctor(session, 'Sharon Shields'), true);
  assert.equal(isSessionCountedForDoctor(session, 'Omar Elshafey'), false);
  assert.equal(isSessionCountedForDoctor(session, 'Nathan Shields'), false);
});

test('cancelled sessions do not count for either tutor', () => {
  const session = { ...coveredSession, cancelled_session: true };
  assert.equal(isSessionCountedForDoctor(session, 'Omar Elshafey'), false);
  assert.equal(isSessionCountedForDoctor(session, 'Sharon Shields'), false);
});

test('missing or unresolved attribution does not silently count as a delivered session', () => {
  assert.equal(isSessionCountedForDoctor({}, 'Omar Elshafey'), false);
  assert.equal(isSessionCountedForDoctor({ ...coveredSession, effective_doctor: null }, 'Omar Elshafey'), false);
  assert.equal(isSessionCountedForDoctor(coveredSession, ''), false);
});

test('older API responses still require an explicit matching owner or covering tutor', () => {
  const legacyCoverage = { ...coveredSession };
  delete legacyCoverage.effective_doctor;
  assert.equal(isSessionCountedForDoctor(legacyCoverage, 'Omar Elshafey'), true);
  assert.equal(isSessionCountedForDoctor(legacyCoverage, 'Sharon Shields'), false);
  assert.equal(isSessionCountedForDoctor({ owner_doctor: 'Sharon Shields' }, 'Sharon Shields'), true);
  assert.equal(isSessionCountedForDoctor({ owner_doctor: 'Sharon Shields' }, 'Omar Elshafey'), false);
});

test('an undelivered row cannot be credited even when its cancellation flag is absent', () => {
  assert.equal(isSessionCountedForDoctor({ effective_doctor: 'Sharon Shields', is_delivered: false }, 'Sharon Shields'), false);
});

test('Amgad cohort metrics exclude Jolyon coverage and cancellation and use the 50 recorded observations', () => {
  const sessions = [
    ...[10, 10, 9, 9, 10].map(met => ({ effective_doctor: 'Dr. Amgad Badewi', met_count: met, partial_count: 10 - met, duration_minutes: 120 })),
    { owner_doctor: 'Dr. Amgad Badewi', effective_doctor: 'Jolyon', met_count: 10, duration_minutes: 126 },
    { owner_doctor: 'Dr. Amgad Badewi', effective_doctor: null, cancelled_session: true, not_met_count: 10 },
  ];
  assert.deepEqual(summarizeDoctorSessions(sessions, 'Dr. Amgad Badewi'), {
    count: 5, met: 48, partial: 2, notMet: 0, durationMinutes: 600, observations: 50, compliance: 96,
  });
  assert.equal(summarizeDoctorSessions(sessions, 'Jolyon').count, 1);
});

test('ten and eleven criteria can both be fully compliant without invented missing criteria', () => {
  assert.equal(getSessionCompliancePercent({ met_count: 10 }), 100);
  assert.equal(getSessionCompliancePercent({ met_count: 11 }), 100);
  assert.equal(getSessionCompliancePercent({ met_count: 9, partial_count: 1 }), 90);
  assert.equal(getSessionCompliancePercent({}), 0);
});

test('coverage labels do not conflate tutors with a shared first or last name', () => {
  assert.equal(doctorIdentityMatches('Sharon Shields', 'Nathan Shields'), false);
  assert.equal(doctorIdentityMatches('Omar Badr', 'Omar Elshafey'), false);
});
