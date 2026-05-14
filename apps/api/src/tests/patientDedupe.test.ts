import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { bootstrapDb, resetAssignmentTables, TEST_PRACTICE_ID } from './helpers.js';
import { db, nowIso } from '../db/database.js';
import {
  createSubmission,
  findPatientIdByPracticeNameDob,
  materializePatientFromSubmission,
  normalizeDobForMatch,
} from '../db/queries.js';

beforeAll(() => bootstrapDb());
beforeEach(() => resetAssignmentTables());

describe('patient dedupe (Excel + parent intake)', () => {
  it('materializePatientFromSubmission reuses existing patient by practice + name + DOB', () => {
    const first = `Alex${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const last = `Jones${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const dob = '2018-07-22';
    const now = nowIso();
    const excelPatientId = randomUUID();
    db.prepare(
      `insert into patients (
         id, practice_id, account_id, child_first_name, child_last_name, child_dob, visit_type,
         preferred_language, sex, race_ethnicity, created_at, updated_at
       ) values (?, ?, null, ?, ?, ?, 'new_patient', null, null, null, ?, ?)`,
    ).run(excelPatientId, TEST_PRACTICE_ID, first, last, dob, now, now);

    const submission = createSubmission({
      practiceId: TEST_PRACTICE_ID,
      visitType: 'well_child',
      formId: 'patient_registration',
      templateVersion: 'patient_registration@v1',
      initialData: {
        patient: {
          child: { first_name: first, last_name: last, dob },
        },
      },
      confirmationCode: 'SP-DEDUP1',
    });

    expect(submission.patient_id).toBeNull();

    materializePatientFromSubmission(submission.id);

    const updated = db.prepare('select patient_id from submissions where id = ?').get(submission.id) as {
      patient_id: string;
    };
    expect(updated.patient_id).toBe(excelPatientId);

    const count = db
      .prepare(
        `select count(*) as c from patients where practice_id = ?
         and lower(trim(child_first_name)) = lower(trim(?))
         and lower(trim(child_last_name)) = lower(trim(?))
         and child_dob = ?`,
      )
      .get(TEST_PRACTICE_ID, first, last, dob) as { c: number };
    expect(count.c).toBe(1);
  });

  it('findPatientIdByPracticeNameDob matches ISO date strings to stored YYYY-MM-DD', () => {
    const first = `Sam${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const last = `Lee${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const dobStored = '2019-11-05';
    const now = nowIso();
    const id = randomUUID();
    db.prepare(
      `insert into patients (
         id, practice_id, account_id, child_first_name, child_last_name, child_dob, visit_type,
         preferred_language, sex, race_ethnicity, created_at, updated_at
       ) values (?, ?, null, ?, ?, ?, 'new_patient', null, null, null, ?, ?)`,
    ).run(id, TEST_PRACTICE_ID, first, last, dobStored, now, now);

    const isoDob = `${dobStored}T00:00:00.000Z`;
    expect(normalizeDobForMatch(isoDob)).toBe(dobStored);
    expect(findPatientIdByPracticeNameDob(TEST_PRACTICE_ID, first, last, isoDob)).toBe(id);
  });
});
