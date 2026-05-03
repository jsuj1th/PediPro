import { randomBytes, randomUUID } from 'node:crypto';
import { db, nowIso } from './database.js';
import { createAssignment, type AssignmentRow } from './assignmentQueries.js';

export type BundleRow = {
  id: string;
  practice_id: string;
  patient_id: string;
  assigned_by: string;
  token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type BundleAssignmentRow = AssignmentRow & { bundle_id: string | null };

export function createBundleWithAssignments(input: {
  practiceId: string;
  patientId: string;
  assignedBy: string;
  templateIds: string[];
  expiresInDays?: number;
}): { bundle: BundleRow; assignments: AssignmentRow[] } {
  const bundleId = randomUUID();
  const bundleToken = randomBytes(16).toString('hex');
  const days = input.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const now = nowIso();

  db.prepare(
    `insert into assignment_bundles
       (id, practice_id, patient_id, assigned_by, token, expires_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(bundleId, input.practiceId, input.patientId, input.assignedBy, bundleToken, expiresAt, now, now);

  const assignments: AssignmentRow[] = input.templateIds.map((templateId) => {
    const a = createAssignment({
      practiceId: input.practiceId,
      patientId: input.patientId,
      templateId,
      assignedBy: input.assignedBy,
      expiresInDays: days,
    });
    db.prepare(`update form_assignments set bundle_id = ? where id = ?`).run(bundleId, a.id);
    return a;
  });

  const bundle = getBundleByIdOrThrow(bundleId);
  return { bundle, assignments };
}

export function getBundleByToken(token: string): BundleRow | undefined {
  return db.prepare('select * from assignment_bundles where token = ?').get(token) as BundleRow | undefined;
}

export function getBundleByIdOrThrow(id: string): BundleRow {
  const row = db.prepare('select * from assignment_bundles where id = ?').get(id) as BundleRow | undefined;
  if (!row) throw new Error('Bundle not found');
  return row;
}

export function getAssignmentsForBundle(bundleId: string): Array<AssignmentRow & { template_name: string }> {
  return db
    .prepare(
      `select fa.*, t.name as template_name
       from form_assignments fa
       join pdf_templates t on t.id = fa.template_id
       where fa.bundle_id = ?
       order by fa.created_at asc`,
    )
    .all(bundleId) as Array<AssignmentRow & { template_name: string }>;
}
