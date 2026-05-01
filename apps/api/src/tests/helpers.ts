import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { runMigrations } from '../db/migrate.js';
import { db, nowIso } from '../db/database.js';
import { hashPassword, signToken } from '../lib/auth.js';
import { fail } from '../lib/response.js';
import { publicRouter } from '../routes/public.js';
import { staffAssignmentsRouter } from '../routes/staffAssignments.js';
import { assignmentsRouter } from '../routes/assignments.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthContext } from '../types.js';

// ── Fixed IDs shared across all helpers ──────────────────────────────────────
export const TEST_PRACTICE_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_STAFF_ID = '22222222-2222-4222-8222-222222222222';
export const TEST_PATIENT_ID = '33333333-3333-4333-8333-333333333333';
export const TEST_TEMPLATE_ID = '44444444-4444-4444-8444-444444444444';
export const TEST_PRACTICE_SLUG = 'test-clinic';

// ── App factory (no server.listen) ───────────────────────────────────────────
export function buildTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', publicRouter);
  app.use('/api/staff/assignments', authMiddleware('staff'), staffAssignmentsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use((_req, res) => fail(res, 'NOT_FOUND', 'Route not found', 404));
  return app;
}

// ── DB bootstrap ─────────────────────────────────────────────────────────────
export function bootstrapDb() {
  runMigrations();
  const now = nowIso();

  db.prepare(
    `insert into practices (id, name, slug, logo_url, settings_json, created_at)
     values (?, ?, ?, null, '{}', ?)`,
  ).run(TEST_PRACTICE_ID, 'Test Clinic', TEST_PRACTICE_SLUG, now);

  db.prepare(
    `insert into staff_users (id, email, password_hash, practice_id, role, is_active, created_at)
     values (?, ?, ?, ?, 'admin', 1, ?)`,
  ).run(TEST_STAFF_ID, 'admin@test.com', hashPassword('Test@1234'), TEST_PRACTICE_ID, now);

  db.prepare(
    `insert into patients
       (id, practice_id, account_id, child_first_name, child_last_name, child_dob,
        visit_type, created_at, updated_at)
     values (?, ?, null, ?, ?, ?, ?, ?, ?)`,
  ).run(TEST_PATIENT_ID, TEST_PRACTICE_ID, 'Emma', 'Smith', '2020-06-15', 'new_patient', now, now);

  db.prepare(
    `insert into pdf_templates
       (id, practice_id, template_key, version, name, source_pdf_path, acroform_pdf_path,
        status, created_by, created_at, updated_at)
     values (?, ?, ?, 1, ?, ?, null, 'published', ?, ?, ?)`,
  ).run(
    TEST_TEMPLATE_ID,
    TEST_PRACTICE_ID,
    'test_form',
    'Test Registration Form',
    'templates/source/test.pdf',
    TEST_STAFF_ID,
    now,
    now,
  );
}

// ── Token helpers ─────────────────────────────────────────────────────────────
export function staffToken(overrides: Partial<AuthContext> = {}): string {
  return signToken({
    id: TEST_STAFF_ID,
    practiceId: TEST_PRACTICE_ID,
    role: 'admin',
    email: 'admin@test.com',
    ...overrides,
  });
}

// ── Clean up between tests ────────────────────────────────────────────────────
export function resetAssignmentTables() {
  // submission_events has a FK on submissions.id — delete child rows first
  db.prepare('delete from submission_events').run();
  db.prepare('delete from form_assignments').run();
  db.prepare('delete from submissions').run();
}

// ── Low-level assignment factory (bypasses HTTP) ──────────────────────────────
export function insertAssignment(overrides: {
  id?: string;
  token?: string;
  status?: string;
  expiresAt?: string;
  submissionId?: string;
} = {}): { id: string; token: string } {
  const id = overrides.id ?? randomUUID();
  const token = overrides.token ?? randomUUID().replace(/-/g, '');
  const now = nowIso();
  const expiresAt =
    overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `insert into form_assignments
       (id, practice_id, patient_id, template_id, assigned_by, token, status, submission_id,
        expires_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    TEST_PRACTICE_ID,
    TEST_PATIENT_ID,
    TEST_TEMPLATE_ID,
    TEST_STAFF_ID,
    token,
    overrides.status ?? 'pending',
    overrides.submissionId ?? null,
    expiresAt,
    now,
    now,
  );

  return { id, token };
}
