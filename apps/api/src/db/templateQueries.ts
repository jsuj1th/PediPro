import { randomUUID } from 'node:crypto';
import { db, nowIso, parseJson, stringifyJson } from './database.js';

export type TemplateStatus = 'draft' | 'published' | 'archived';

export type TemplateFieldInput = {
  field_id: string;
  field_name: string;
  field_type: string;
  acro_field_name: string;
  required?: boolean;
  page_number?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  options_json?: unknown[];
  validation_json?: Record<string, unknown>;
  section_key?: string;
  display_order?: number;
};

export type TemplateFieldRecord = {
  id: string;
  template_id: string;
  field_id: string;
  field_name: string;
  field_type: string;
  acro_field_name: string;
  required: number;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  options_json: string;
  validation_json: string;
  section_key: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type TemplateRecord = {
  id: string;
  practice_id: string;
  template_key: string;
  version: number;
  name: string;
  source_pdf_path: string;
  acroform_pdf_path: string | null;
  status: TemplateStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function listTemplates(practiceId: string): Array<TemplateRecord> {
  return db
    .prepare(
      `select * from pdf_templates
       where practice_id = ?
       order by template_key asc, version desc`,
    )
    .all(practiceId) as Array<TemplateRecord>;
}

export function listPublishedTemplatesForPractice(practiceId: string): Array<TemplateRecord> {
  return db
    .prepare(
      `select * from pdf_templates
       where practice_id = ? and status = 'published'
       order by template_key asc, version desc`,
    )
    .all(practiceId) as Array<TemplateRecord>;
}

export function createTemplate(input: {
  practiceId: string;
  templateKey: string;
  name: string;
  sourcePdfPath: string;
  createdBy?: string;
}): TemplateRecord {
  const max = db
    .prepare('select coalesce(max(version), 0) as max_version from pdf_templates where practice_id = ? and template_key = ?')
    .get(input.practiceId, input.templateKey) as { max_version: number };

  const version = Number(max.max_version ?? 0) + 1;
  const id = randomUUID();
  const now = nowIso();

  db.prepare(
    `insert into pdf_templates (
      id, practice_id, template_key, version, name, source_pdf_path, acroform_pdf_path,
      status, created_by, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, null, 'draft', ?, ?, ?)`,
  ).run(id, input.practiceId, input.templateKey, version, input.name, input.sourcePdfPath, input.createdBy ?? null, now, now);

  return getTemplateByIdOrThrow(id, input.practiceId);
}

export function getTemplateById(templateId: string, practiceId: string): TemplateRecord | undefined {
  return db
    .prepare('select * from pdf_templates where id = ? and practice_id = ?')
    .get(templateId, practiceId) as TemplateRecord | undefined;
}

export function getTemplateByIdOrThrow(templateId: string, practiceId: string): TemplateRecord {
  const template = getTemplateById(templateId, practiceId);
  if (!template) throw new Error('Template not found');
  return template;
}

export function getTemplateFields(templateId: string): Array<TemplateFieldRecord> {
  return db
    .prepare('select * from pdf_template_fields where template_id = ? order by section_key asc, display_order asc, created_at asc')
    .all(templateId) as Array<TemplateFieldRecord>;
}

export function getTemplateWithFields(templateId: string, practiceId: string): Record<string, unknown> {
  const template = getTemplateByIdOrThrow(templateId, practiceId);
  const fields = getTemplateFields(templateId).map((row) => ({
    ...row,
    required: Boolean(row.required),
    options_json: parseJson(row.options_json, []),
    validation_json: parseJson(row.validation_json, {}),
  }));

  return {
    ...template,
    fields,
  };
}

export function addTemplateField(input: {
  templateId: string;
  practiceId: string;
  field: TemplateFieldInput;
}): Record<string, unknown> {
  const template = getTemplateByIdOrThrow(input.templateId, input.practiceId);
  const id = randomUUID();
  const now = nowIso();

  db.prepare(
    `insert into pdf_template_fields (
      id, template_id, field_id, field_name, field_type, acro_field_name, required,
      page_number, x, y, width, height, options_json, validation_json,
      section_key, display_order, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    template.id,
    input.field.field_id,
    input.field.field_name,
    input.field.field_type,
    input.field.acro_field_name,
    input.field.required ? 1 : 0,
    input.field.page_number ?? 1,
    input.field.x ?? 50,
    input.field.y ?? 700,
    input.field.width ?? 180,
    input.field.height ?? 18,
    stringifyJson(input.field.options_json ?? []),
    stringifyJson(input.field.validation_json ?? {}),
    input.field.section_key ?? 'General',
    input.field.display_order ?? 0,
    now,
    now,
  );

  return getTemplateWithFields(template.id, input.practiceId);
}

export function updateTemplateField(input: {
  templateId: string;
  practiceId: string;
  fieldDbId: string;
  patch: Partial<TemplateFieldInput>;
}): Record<string, unknown> {
  const template = getTemplateByIdOrThrow(input.templateId, input.practiceId);

  const existing = db
    .prepare('select * from pdf_template_fields where id = ? and template_id = ?')
    .get(input.fieldDbId, template.id) as TemplateFieldRecord | undefined;
  if (!existing) throw new Error('Template field not found');

  const merged = {
    ...existing,
    ...input.patch,
    required:
      typeof input.patch.required === 'boolean'
        ? (input.patch.required ? 1 : 0)
        : existing.required,
    options_json:
      input.patch.options_json !== undefined
        ? stringifyJson(input.patch.options_json)
        : existing.options_json,
    validation_json:
      input.patch.validation_json !== undefined
        ? stringifyJson(input.patch.validation_json)
        : existing.validation_json,
    updated_at: nowIso(),
  };

  db.prepare(
    `update pdf_template_fields
     set field_id=?, field_name=?, field_type=?, acro_field_name=?, required=?, page_number=?,
         x=?, y=?, width=?, height=?, options_json=?, validation_json=?, section_key=?,
         display_order=?, updated_at=?
     where id=? and template_id=?`,
  ).run(
    merged.field_id,
    merged.field_name,
    merged.field_type,
    merged.acro_field_name,
    merged.required,
    merged.page_number,
    merged.x,
    merged.y,
    merged.width,
    merged.height,
    merged.options_json,
    merged.validation_json,
    merged.section_key,
    merged.display_order,
    merged.updated_at,
    input.fieldDbId,
    template.id,
  );

  return getTemplateWithFields(template.id, input.practiceId);
}

export function deleteTemplateField(input: {
  templateId: string;
  practiceId: string;
  fieldDbId: string;
}): Record<string, unknown> {
  const template = getTemplateByIdOrThrow(input.templateId, input.practiceId);
  db.prepare('delete from pdf_template_fields where id = ? and template_id = ?').run(input.fieldDbId, template.id);
  return getTemplateWithFields(template.id, input.practiceId);
}

export function setTemplateAcroformPath(input: {
  templateId: string;
  practiceId: string;
  acroformPdfPath: string;
}): TemplateRecord {
  const template = getTemplateByIdOrThrow(input.templateId, input.practiceId);
  db.prepare('update pdf_templates set acroform_pdf_path = ?, updated_at = ? where id = ?').run(
    input.acroformPdfPath,
    nowIso(),
    template.id,
  );
  return getTemplateByIdOrThrow(template.id, input.practiceId);
}

export function publishTemplate(input: {
  templateId: string;
  practiceId: string;
  publishedBy: string;
}): TemplateRecord {
  const template = getTemplateByIdOrThrow(input.templateId, input.practiceId);

  db.prepare(
    `update pdf_templates
     set status = case when id = ? then 'published' else 'archived' end,
         updated_at = ?
     where practice_id = ? and template_key = ? and status in ('draft', 'published')`,
  ).run(template.id, nowIso(), input.practiceId, template.template_key);

  db.prepare(
    `insert into template_publish_events (template_id, practice_id, published_by, created_at)
     values (?, ?, ?, ?)`,
  ).run(template.id, input.practiceId, input.publishedBy, nowIso());

  return getTemplateByIdOrThrow(template.id, input.practiceId);
}

export function deleteTemplateVersion(input: {
  templateId: string;
  practiceId: string;
}): TemplateRecord {
  const template = getTemplateByIdOrThrow(input.templateId, input.practiceId);
  if (template.status === 'published') {
    throw new Error('Cannot delete published template version. Publish another version first.');
  }

  db.prepare('delete from pdf_templates where id = ? and practice_id = ?').run(template.id, input.practiceId);
  return template;
}

export function getActivePublishedTemplate(practiceId: string, templateKey = 'patient_registration'): Record<string, unknown> | null {
  const template = db
    .prepare(
      `select * from pdf_templates
       where practice_id = ? and template_key = ? and status = 'published'
       order by version desc limit 1`,
    )
    .get(practiceId, templateKey) as TemplateRecord | undefined;

  if (!template) return null;

  const fields = getTemplateFields(template.id).map((row) => ({
    id: row.id,
    field_id: row.field_id,
    field_name: row.field_name,
    field_type: row.field_type,
    acro_field_name: row.acro_field_name,
    required: Boolean(row.required),
    page_number: row.page_number,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    options_json: parseJson(row.options_json, []),
    validation_json: parseJson(row.validation_json, {}),
    section_key: row.section_key ?? 'General',
    display_order: row.display_order,
  }));

  return {
    ...template,
    fields,
  };
}

export function getTemplateBySubmissionContext(submissionId: string): {
  template: TemplateRecord;
  fields: Array<Record<string, unknown>>;
} | null {
  const submission = db
    .prepare('select template_id, practice_id from submissions where id = ?')
    .get(submissionId) as { template_id: string | null; practice_id: string } | undefined;

  if (!submission?.template_id) return null;

  const template = db
    .prepare('select * from pdf_templates where id = ? and practice_id = ?')
    .get(submission.template_id, submission.practice_id) as TemplateRecord | undefined;
  if (!template) return null;

  const fields = getTemplateFields(template.id).map((row) => ({
    ...row,
    required: Boolean(row.required),
    options_json: parseJson(row.options_json, []),
    validation_json: parseJson(row.validation_json, {}),
  }));

  return {
    template,
    fields,
  };
}
