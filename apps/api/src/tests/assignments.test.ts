import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { db, nowIso } from '../db/database.js';
import { getAssignmentByToken } from '../db/assignmentQueries.js';
import {
  bootstrapDb,
  buildTestApp,
  resetAssignmentTables,
  insertAssignment,
  TEST_PATIENT_ID,
  TEST_PRACTICE_SLUG,
  TEST_TEMPLATE_ID,
} from './helpers.js';

const app = buildTestApp();

beforeAll(() => bootstrapDb());
beforeEach(() => resetAssignmentTables());

// ── GET /api/assignments/:token ───────────────────────────────────────────────

describe('GET /api/assignments/:token', () => {
  it('returns patient first name, template name, and status for a valid pending token', async () => {
    const { token } = insertAssignment();

    const res = await request(app).get(`/api/assignments/${token}`);

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.patient_first_name).toBe('Emma');
    expect(data.template_name).toBe('Test Registration Form');
    expect(data.status).toBe('pending');
    expect(data.expires_at).toBeTruthy();
  });

  it('does not expose last name or DOB in the response', async () => {
    const { token } = insertAssignment();

    const res = await request(app).get(`/api/assignments/${token}`);

    expect(res.body.data).not.toHaveProperty('child_last_name');
    expect(res.body.data).not.toHaveProperty('patient_last_name');
    expect(res.body.data).not.toHaveProperty('dob');
    expect(res.body.data).not.toHaveProperty('child_dob');
  });

  it('returns 404 for an unknown token', async () => {
    const res = await request(app).get('/api/assignments/notavalidtoken');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 410 for an expired assignment', async () => {
    const { token } = insertAssignment({
      status: 'expired',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await request(app).get(`/api/assignments/${token}`);

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('ASSIGNMENT_EXPIRED');
  });

  it('auto-expires a pending assignment whose expires_at is in the past', async () => {
    const { token } = insertAssignment({
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await request(app).get(`/api/assignments/${token}`);

    expect(res.status).toBe(410);
  });

  it('returns 409 for a completed assignment', async () => {
    const { token } = insertAssignment({ status: 'completed' });

    const res = await request(app).get(`/api/assignments/${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ASSIGNMENT_COMPLETED');
  });

  it('allows access to an in_progress assignment (patient can continue filling)', async () => {
    const { token } = insertAssignment({ status: 'in_progress' });

    const res = await request(app).get(`/api/assignments/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_progress');
  });
});

// ── POST /api/assignments/:token/verify ───────────────────────────────────────

describe('POST /api/assignments/:token/verify', () => {
  it('returns session_id and practice_slug on correct identity', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.session_id).toBeTruthy();
    expect(data.practice_slug).toBe(TEST_PRACTICE_SLUG);
    expect(data.template_id).toBe(TEST_TEMPLATE_ID);
  });

  it('creates a submission linked to the patient and template', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(200);
    const sessionId = res.body.data.session_id;

    const submission = db
      .prepare('select patient_id, template_id, status from submissions where id = ?')
      .get(sessionId) as { patient_id: string; template_id: string; status: string } | undefined;

    expect(submission?.patient_id).toBe(TEST_PATIENT_ID);
    expect(submission?.template_id).toBe(TEST_TEMPLATE_ID);
    expect(submission?.status).toBe('in_progress');
  });

  it('advances assignment status to in_progress and stores submission_id', async () => {
    const { token, id } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(200);

    const assignment = getAssignmentByToken(token)!;
    expect(assignment.status).toBe('in_progress');
    expect(assignment.submission_id).toBe(res.body.data.session_id);
  });

  it('is case-insensitive for name matching', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'EMMA', last_name: 'SMITH', dob: '2020-06-15' });

    expect(res.status).toBe(200);
  });

  it('trims whitespace in the submitted name', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: '  Emma  ', last_name: '  Smith  ', dob: '2020-06-15' });

    expect(res.status).toBe(200);
  });

  it('returns 403 when first_name does not match', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Wrong', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('IDENTITY_MISMATCH');
  });

  it('returns 403 when last_name does not match', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Jones', dob: '2020-06-15' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('IDENTITY_MISMATCH');
  });

  it('returns 403 when DOB does not match', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2021-01-01' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('IDENTITY_MISMATCH');
  });

  it('returns 422 when required fields are missing', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma' }); // missing last_name and dob

    expect(res.status).toBe(422);
  });

  it('returns 404 for an unknown token', async () => {
    const res = await request(app)
      .post('/api/assignments/notavalidtoken/verify')
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(404);
  });

  it('returns 410 when the assignment has expired', async () => {
    const { token } = insertAssignment({
      status: 'expired',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(410);
  });

  it('returns 409 when the form has already been completed', async () => {
    const { token } = insertAssignment({ status: 'completed' });

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(409);
  });

  it('reuses an existing in_progress submission instead of creating a new one', async () => {
    // First verify creates the submission
    const { token } = insertAssignment();
    const first = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(first.status).toBe(200);
    const sessionId = first.body.data.session_id;

    // Second verify should return the same session
    const second = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(second.status).toBe(200);
    expect(second.body.data.session_id).toBe(sessionId);

    // Only one submission should exist
    const count = db
      .prepare('select count(*) as c from submissions where patient_id = ?')
      .get(TEST_PATIENT_ID) as { c: number };
    expect(count.c).toBe(1);
  });

  it('records a submission event for assignment_verified', async () => {
    const { token } = insertAssignment();

    const res = await request(app)
      .post(`/api/assignments/${token}/verify`)
      .send({ first_name: 'Emma', last_name: 'Smith', dob: '2020-06-15' });

    expect(res.status).toBe(200);

    const event = db
      .prepare(
        `select event_type, event_payload_json from submission_events
         where submission_id = ? and event_type = 'assignment_verified'`,
      )
      .get(res.body.data.session_id) as { event_type: string; event_payload_json: string } | undefined;

    expect(event?.event_type).toBe('assignment_verified');
    const payload = JSON.parse(event!.event_payload_json);
    expect(payload.assignment_id).toBeTruthy();
  });
});
