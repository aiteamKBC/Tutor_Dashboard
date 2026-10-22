import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionCountedForDoctor } from './sessionAttribution.ts';

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
  const { effective_doctor, ...legacyCoverage } = coveredSession;
  assert.equal(isSessionCountedForDoctor(legacyCoverage, 'Omar Elshafey'), true);
  assert.equal(isSessionCountedForDoctor(legacyCoverage, 'Sharon Shields'), false);
  assert.equal(isSessionCountedForDoctor({ owner_doctor: 'Sharon Shields' }, 'Sharon Shields'), true);
  assert.equal(isSessionCountedForDoctor({ owner_doctor: 'Sharon Shields' }, 'Omar Elshafey'), false);
});
