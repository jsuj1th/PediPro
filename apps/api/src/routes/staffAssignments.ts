import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { ok, fail } from '../lib/response.js';
import {
  createAssignment,
  getAssignmentById,
  listAssignmentsForPractice,
  listAssignmentsForPatient,
  expireStaleAssignments,
  deleteAssignment,
} from '../db/assignmentQueries.js';
import { db, nowIso } from '../db/database.js';

export const staffAssignmentsRouter = Router();

const byPatientIdSchema = z.object({
  patient_id: z.string().uuid(),
  template_id: z.string().uuid(),
  expires_in_days: z.number().int().min(1).max(90).optional(),
});

const byNameDobSchema = z.object({
  first_name: z.string().min(1).trim(),
  last_name: z.string().min(1).trim(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD'),
  template_id: z.string().uuid(),
  expires_in_days: z.number().int().min(1).max(90).optional(),
});

staffAssignmentsRouter.post('/', async (req, res) => {
  const auth = req.user as { id: string; practiceId: string };

  // Resolve patient — either by existing patient_id or by name+DOB (find or create)
  let patientId: string;
  let patientName: string;
  let templateId: string;
  let expiresInDays: number | undefined;

  const byId = byPatientIdSchema.safeParse(req.body);
  if (byId.success) {
    const existing = db
      .prepare('select id, child_first_name, child_last_name from patients where id = ? and practice_id = ?')
      .get(byId.data.patient_id, auth.practiceId) as
      | { id: string; child_first_name: string; child_last_name: string }
      | undefined;
    if (!existing) {
      fail(res, 'NOT_FOUND', 'Patient not found', 404);
      return;
    }
    patientId = existing.id;
    patientName = `${existing.child_first_name} ${existing.child_last_name}`;
    templateId = byId.data.template_id;
    expiresInDays = byId.data.expires_in_days;
  } else {
    const byName = byNameDobSchema.safeParse(req.body);
    if (!byName.success) {
      fail(res, 'VALIDATION_ERROR', 'Provide either patient_id or first_name + last_name + dob', 422);
      return;
    }

    const { first_name, last_name, dob } = byName.data;
    templateId = byName.data.template_id;
    expiresInDays = byName.data.expires_in_days;

    // Try to find existing patient by name+DOB in this practice
    const found = db
      .prepare(
        `select id from patients
         where practice_id = ?
           and lower(trim(child_first_name)) = lower(trim(?))
           and lower(trim(child_last_name)) = lower(trim(?))
           and child_dob = ?`,
      )
      .get(auth.practiceId, first_name, last_name, dob) as { id: string } | undefined;

    if (found) {
      patientId = found.id;
    } else {
      // Create a minimal patient record
      const now = nowIso();
      patientId = randomUUID();
      db.prepare(
        `insert into patients
           (id, practice_id, account_id, child_first_name, child_last_name, child_dob,
            visit_type, preferred_language, sex, race_ethnicity, created_at, updated_at)
         values (?, ?, null, ?, ?, ?, '', null, null, null, ?, ?)`,
      ).run(patientId, auth.practiceId, first_name, last_name, dob, now, now);
    }

    patientName = `${first_name} ${last_name}`;
  }

  // Verify template belongs to this practice and is published
  const template = db
    .prepare(`select id, name, template_key from pdf_templates where id = ? and practice_id = ? and status = 'published'`)
    .get(templateId, auth.practiceId) as { id: string; name: string; template_key: string } | undefined;

  if (!template) {
    fail(res, 'NOT_FOUND', 'Published template not found', 404);
    return;
  }

  const assignment = createAssignment({
    practiceId: auth.practiceId,
    patientId,
    templateId,
    assignedBy: auth.id,
    expiresInDays,
  });

  const fillUrl = `${config.frontendUrl}/fill/${assignment.token}`;
  const qrCodeDataUrl = await QRCode.toDataURL(fillUrl, { width: 300, margin: 2 });

  ok(res, {
    ...assignment,
    patient_name: patientName,
    template_name: template.name,
    fill_url: fillUrl,
    qr_code_data_url: qrCodeDataUrl,
  });
});

staffAssignmentsRouter.get('/', (req, res) => {
  expireStaleAssignments();
  const auth = req.user as { practiceId: string };
  const assignments = listAssignmentsForPractice(auth.practiceId);
  ok(res, assignments);
});

staffAssignmentsRouter.get('/patient/:patientId', (req, res) => {
  expireStaleAssignments();
  const auth = req.user as { practiceId: string };
  const assignments = listAssignmentsForPatient(req.params.patientId, auth.practiceId);
  ok(res, assignments);
});

staffAssignmentsRouter.get('/:id/link', async (req, res) => {
  const auth = req.user as { practiceId: string };
  const assignment = getAssignmentById(req.params.id);

  if (!assignment || assignment.practice_id !== auth.practiceId) {
    fail(res, 'NOT_FOUND', 'Assignment not found', 404);
    return;
  }

  const fillUrl = `${config.frontendUrl}/fill/${assignment.token}`;
  const qrCodeDataUrl = await QRCode.toDataURL(fillUrl, { width: 300, margin: 2 });

  ok(res, { fill_url: fillUrl, qr_code_data_url: qrCodeDataUrl });
});

const smsSchema = z.object({
  phone: z.string().min(10),
});

staffAssignmentsRouter.delete('/:id', (req, res) => {
  const auth = req.user as { practiceId: string };
  const deleted = deleteAssignment(req.params.id, auth.practiceId);
  if (!deleted) {
    fail(res, 'NOT_FOUND', 'Assignment not found', 404);
    return;
  }
  ok(res, { deleted: true });
});

staffAssignmentsRouter.post('/:id/send-sms', async (req, res) => {
  const parsed = smsSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 'VALIDATION_ERROR', 'Phone number required', 422);
    return;
  }

  // Load and validate the assignment before checking Twilio config so callers
  // get a meaningful error (expired/completed) rather than a generic 503.
  const auth = req.user as { practiceId: string };
  const assignment = getAssignmentById(req.params.id);

  if (!assignment || assignment.practice_id !== auth.practiceId) {
    fail(res, 'NOT_FOUND', 'Assignment not found', 404);
    return;
  }

  if (assignment.status === 'expired') {
    fail(res, 'ASSIGNMENT_EXPIRED', 'This assignment has expired', 400);
    return;
  }
  if (assignment.status === 'completed') {
    fail(res, 'ASSIGNMENT_COMPLETED', 'This form has already been completed', 400);
    return;
  }

  if (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.fromNumber) {
    fail(res, 'SMS_NOT_CONFIGURED', 'SMS sending is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.', 503);
    return;
  }

  const fillUrl = `${config.frontendUrl}/fill/${assignment.token}`;

  const patient = db
    .prepare('select child_first_name from patients where id = ?')
    .get(assignment.patient_id) as { child_first_name: string } | undefined;

  const firstName = patient?.child_first_name ?? 'your child';
  const message = `Your medical form for ${firstName} is ready to complete. Please visit: ${fillUrl}`;

  const credentials = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
  const body = new URLSearchParams({
    To: parsed.data.phone,
    From: config.twilio.fromNumber,
    Body: message,
  });

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
  );

  if (!twilioRes.ok) {
    const errBody = await twilioRes.json().catch(() => ({})) as Record<string, unknown>;
    fail(res, 'SMS_SEND_FAILED', String(errBody.message ?? 'Failed to send SMS'), 500);
    return;
  }

  ok(res, { sent: true, to: parsed.data.phone });
});
