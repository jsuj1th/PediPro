import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, nowIso } from '../db/database.js';
import {
  createAssignment,
  getAssignmentByToken,
  getAssignmentById,
  listAssignmentsForPractice,
  listAssignmentsForPatient,
  updateAssignment,
  completeAssignmentBySubmissionId,
  expireStaleAssignments,
} from '../db/assignmentQueries.js';
import {
  bootstrapDb,
  resetAssignmentTables,
  TEST_PRACTICE_ID,
  TEST_PATIENT_ID,
  TEST_TEMPLATE_ID,
  TEST_STAFF_ID,
} from './helpers.js';

beforeAll(() => bootstrapDb());
beforeEach(() => resetAssignmentTables());

describe('createAssignment', () => {
  it('creates a record with correct fields', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    expect(a.id).toBeTruthy();
    expect(a.token).toHaveLength(32);
    expect(a.status).toBe('pending');
    expect(a.practice_id).toBe(TEST_PRACTICE_ID);
    expect(a.patient_id).toBe(TEST_PATIENT_ID);
    expect(a.template_id).toBe(TEST_TEMPLATE_ID);
    expect(a.assigned_by).toBe(TEST_STAFF_ID);
    expect(a.submission_id).toBeNull();
  });

  it('defaults expiry to 7 days from now', () => {
    const before = Date.now();
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    const after = Date.now();

    const expiresMs = new Date(a.expires_at).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000 + 1000);
  });

  it('respects a custom expiresInDays', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
      expiresInDays: 30,
    });

    const diffDays = (new Date(a.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });

  it('generates a unique token per assignment', () => {
    const a1 = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    const a2 = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    expect(a1.token).not.toBe(a2.token);
  });
});

describe('getAssignmentByToken', () => {
  it('returns the assignment for a valid token', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    const found = getAssignmentByToken(a.token);
    expect(found?.id).toBe(a.id);
    expect(found?.token).toBe(a.token);
  });

  it('returns undefined for an unknown token', () => {
    expect(getAssignmentByToken('doesnotexist')).toBeUndefined();
  });
});

describe('getAssignmentById', () => {
  it('returns the assignment for a valid id', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    const found = getAssignmentById(a.id);
    expect(found?.id).toBe(a.id);
  });

  it('returns undefined for an unknown id', () => {
    expect(getAssignmentById(randomUUID())).toBeUndefined();
  });
});

describe('listAssignmentsForPractice', () => {
  it('returns all assignments for the practice', () => {
    const a1 = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    const a2 = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    const list = listAssignmentsForPractice(TEST_PRACTICE_ID);
    expect(list.length).toBe(2);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(a1.id);
    expect(ids).toContain(a2.id);
  });

  it('includes joined patient and template name fields', () => {
    createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    const [row] = listAssignmentsForPractice(TEST_PRACTICE_ID);
    expect(row.child_first_name).toBe('Emma');
    expect(row.child_last_name).toBe('Smith');
    expect(row.template_name).toBe('Test Registration Form');
    expect(row.assigned_by_email).toBe('admin@test.com');
  });

  it('returns empty array for a practice with no assignments', () => {
    const otherId = randomUUID();
    expect(listAssignmentsForPractice(otherId)).toEqual([]);
  });
});

describe('listAssignmentsForPatient', () => {
  it('returns only assignments for the specified patient', () => {
    const otherPatientId = randomUUID();
    const now = nowIso();
    db.prepare(
      `insert into patients (id, practice_id, account_id, child_first_name, child_last_name,
        child_dob, visit_type, created_at, updated_at)
       values (?, ?, null, 'Other', 'Patient', '2019-01-01', 'new_patient', ?, ?)`,
    ).run(otherPatientId, TEST_PRACTICE_ID, now, now);

    createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: otherPatientId,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    const list = listAssignmentsForPatient(TEST_PATIENT_ID, TEST_PRACTICE_ID);
    expect(list.length).toBe(1);
    expect(list[0].template_name).toBe('Test Registration Form');
  });
});

describe('updateAssignment', () => {
  it('updates status only', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });

    updateAssignment(a.id, { status: 'in_progress' });

    const updated = getAssignmentById(a.id)!;
    expect(updated.status).toBe('in_progress');
    expect(updated.submission_id).toBeNull();
  });

  it('updates status and submissionId together', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    const fakeSubId = randomUUID();

    updateAssignment(a.id, { status: 'in_progress', submissionId: fakeSubId });

    const updated = getAssignmentById(a.id)!;
    expect(updated.status).toBe('in_progress');
    expect(updated.submission_id).toBe(fakeSubId);
  });
});

describe('completeAssignmentBySubmissionId', () => {
  it('marks the matching assignment as completed', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    const fakeSubId = randomUUID();
    updateAssignment(a.id, { status: 'in_progress', submissionId: fakeSubId });

    completeAssignmentBySubmissionId(fakeSubId);

    expect(getAssignmentById(a.id)!.status).toBe('completed');
  });

  it('does not affect assignments with a different submission_id', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    updateAssignment(a.id, { status: 'in_progress', submissionId: randomUUID() });

    completeAssignmentBySubmissionId(randomUUID());

    expect(getAssignmentById(a.id)!.status).toBe('in_progress');
  });

  it('is idempotent — does not change an already-completed assignment', () => {
    const a = createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
    });
    const subId = randomUUID();
    updateAssignment(a.id, { status: 'in_progress', submissionId: subId });
    completeAssignmentBySubmissionId(subId);
    completeAssignmentBySubmissionId(subId); // second call

    expect(getAssignmentById(a.id)!.status).toBe('completed');
  });
});

describe('expireStaleAssignments', () => {
  it('marks pending assignments past their expiry as expired', () => {
    const now = nowIso();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    db.prepare(
      `insert into form_assignments
         (id, practice_id, patient_id, template_id, assigned_by, token, status,
          submission_id, expires_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, 'pending', null, ?, ?, ?)`,
    ).run(
      randomUUID(),
      TEST_PRACTICE_ID,
      TEST_PATIENT_ID,
      TEST_TEMPLATE_ID,
      TEST_STAFF_ID,
      randomUUID().replace(/-/g, ''),
      pastExpiry,
      now,
      now,
    );

    const changed = expireStaleAssignments();
    expect(changed).toBe(1);
  });

  it('does not expire in_progress or completed assignments', () => {
    const now = nowIso();
    const pastExpiry = new Date(Date.now() - 1000).toISOString();

    for (const status of ['in_progress', 'completed']) {
      db.prepare(
        `insert into form_assignments
           (id, practice_id, patient_id, template_id, assigned_by, token, status,
            submission_id, expires_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?)`,
      ).run(
        randomUUID(),
        TEST_PRACTICE_ID,
        TEST_PATIENT_ID,
        TEST_TEMPLATE_ID,
        TEST_STAFF_ID,
        randomUUID().replace(/-/g, ''),
        status,
        pastExpiry,
        now,
        now,
      );
    }

    const changed = expireStaleAssignments();
    expect(changed).toBe(0);
  });

  it('does not expire pending assignments that have not yet expired', () => {
    createAssignment({
      practiceId: TEST_PRACTICE_ID,
      patientId: TEST_PATIENT_ID,
      templateId: TEST_TEMPLATE_ID,
      assignedBy: TEST_STAFF_ID,
      expiresInDays: 7,
    });

    const changed = expireStaleAssignments();
    expect(changed).toBe(0);
  });
});
