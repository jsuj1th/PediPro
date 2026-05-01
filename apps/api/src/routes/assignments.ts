import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ok, fail } from '../lib/response.js';
import { getAssignmentByToken, updateAssignment } from '../db/assignmentQueries.js';
import { createSubmission, addSubmissionEvent, findPracticeById } from '../db/queries.js';
import { getTemplateWithFields } from '../db/templateQueries.js';
import { db } from '../db/database.js';

export const assignmentsRouter = Router();

// GET /api/assignments/:token — check assignment status and return enough info to
// show the verify page without leaking the patient's full identity.
assignmentsRouter.get('/:token', (req, res) => {
  const assignment = getAssignmentByToken(req.params.token);

  if (!assignment) {
    fail(res, 'NOT_FOUND', 'Form link not found', 404);
    return;
  }

  if (assignment.status === 'expired' || new Date(assignment.expires_at) < new Date()) {
    if (assignment.status !== 'expired') {
      updateAssignment(assignment.id, { status: 'expired' });
    }
    fail(res, 'ASSIGNMENT_EXPIRED', 'This form link has expired', 410);
    return;
  }

  if (assignment.status === 'completed') {
    fail(res, 'ASSIGNMENT_COMPLETED', 'This form has already been submitted', 409);
    return;
  }

  const patient = db
    .prepare('select child_first_name from patients where id = ?')
    .get(assignment.patient_id) as { child_first_name: string } | undefined;

  const template = db
    .prepare('select name from pdf_templates where id = ?')
    .get(assignment.template_id) as { name: string } | undefined;

  ok(res, {
    patient_first_name: patient?.child_first_name ?? 'Patient',
    template_name: template?.name ?? 'Form',
    expires_at: assignment.expires_at,
    status: assignment.status,
  });
});

const verifySchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  dob: z.string().min(1),
});

// POST /api/assignments/:token/verify — verify patient identity, then create a
// submission session and return the details needed to redirect into the fill flow.
assignmentsRouter.post('/:token/verify', (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 'VALIDATION_ERROR', 'first_name, last_name, and dob are required', 422);
    return;
  }

  const assignment = getAssignmentByToken(req.params.token);

  if (!assignment) {
    fail(res, 'NOT_FOUND', 'Form link not found', 404);
    return;
  }

  if (assignment.status === 'expired' || new Date(assignment.expires_at) < new Date()) {
    fail(res, 'ASSIGNMENT_EXPIRED', 'This form link has expired', 410);
    return;
  }

  if (assignment.status === 'completed') {
    fail(res, 'ASSIGNMENT_COMPLETED', 'This form has already been submitted', 409);
    return;
  }

  const patient = db
    .prepare('select * from patients where id = ?')
    .get(assignment.patient_id) as Record<string, string> | undefined;

  if (!patient) {
    fail(res, 'NOT_FOUND', 'Patient record not found', 404);
    return;
  }

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const firstMatch = normalize(parsed.data.first_name) === normalize(patient.child_first_name);
  const lastMatch = normalize(parsed.data.last_name) === normalize(patient.child_last_name);
  const dobMatch = parsed.data.dob === patient.child_dob;

  if (!firstMatch || !lastMatch || !dobMatch) {
    fail(res, 'IDENTITY_MISMATCH', 'Name or date of birth does not match our records', 403);
    return;
  }

  const practice = findPracticeById(assignment.practice_id);
  if (!practice) {
    fail(res, 'NOT_FOUND', 'Practice not found', 404);
    return;
  }

  let template: Record<string, unknown>;
  try {
    template = getTemplateWithFields(assignment.template_id, assignment.practice_id) as Record<string, unknown>;
  } catch {
    fail(res, 'NOT_FOUND', 'Form template not found', 404);
    return;
  }

  // If an in_progress submission already exists for this assignment, reuse it.
  if (assignment.submission_id) {
    const existing = db
      .prepare(`select id, status from submissions where id = ?`)
      .get(assignment.submission_id) as { id: string; status: string } | undefined;

    if (existing && existing.status === 'in_progress') {
      ok(res, {
        session_id: existing.id,
        practice_slug: practice.slug,
        template_id: template.id,
      });
      return;
    }
  }

  const confirmationCode = `FA-${randomBytes(3).toString('hex').toUpperCase()}`;
  const submission = createSubmission({
    practiceId: assignment.practice_id,
    patientId: assignment.patient_id,
    visitType: patient.visit_type ?? 'new_patient',
    formId: String(template.template_key),
    templateVersion: `${String(template.template_key)}@v${String(template.version)}`,
    templateId: String(template.id),
    templateVersionNum: Number(template.version),
    initialData: {
      patient: {
        child: {
          first_name: patient.child_first_name,
          last_name: patient.child_last_name,
          dob: patient.child_dob,
        },
      },
      visit_type: patient.visit_type,
      template_key: String(template.template_key),
    },
    confirmationCode,
    ipAddress: req.ip,
  });

  addSubmissionEvent({
    submissionId: submission.id,
    practiceId: assignment.practice_id,
    actorType: 'system',
    eventType: 'assignment_verified',
    payload: { assignment_id: assignment.id },
  });

  updateAssignment(assignment.id, { status: 'in_progress', submissionId: submission.id });

  ok(res, {
    session_id: submission.id,
    practice_slug: String(practice.slug),
    template_id: String(template.id),
  });
});
