import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { fail, ok } from '../lib/response.js';
import {
  addTemplateField,
  createTemplate,
  deleteTemplateVersion,
  deleteTemplateField,
  getTemplateById,
  getTemplateFields,
  getTemplateWithFields,
  listTemplates,
  publishTemplate,
  setTemplateAcroformPath,
  updateTemplateField,
} from '../db/templateQueries.js';
import { buildAcroformPdfFromFieldDefinitions } from '../lib/acroformEngine.js';

export const staffTemplatesRouter = Router();

const sourceUploadDir = path.join(config.rootPath, 'apps', 'data', 'templates', 'source');
fs.mkdirSync(sourceUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, sourceUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.pdf') || '.pdf';
    cb(null, `${Date.now()}_${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.includes('pdf')) {
      cb(new Error('Only PDF upload is allowed'));
      return;
    }
    cb(null, true);
  },
});

staffTemplatesRouter.get('/', (req, res) => {
  const templates = listTemplates(req.user!.practiceId);
  ok(res, templates);
});

staffTemplatesRouter.post('/upload-source', upload.single('file'), (req, res) => {
  if (!req.file) {
    fail(res, 'VALIDATION_ERROR', 'PDF file is required', 422);
    return;
  }

  const bodySchema = z.object({
    template_key: z.string().min(1),
    name: z.string().min(1),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 'VALIDATION_ERROR', 'Invalid metadata', 422, parsed.error.flatten());
    return;
  }

  const template = createTemplate({
    practiceId: req.user!.practiceId,
    templateKey: parsed.data.template_key,
    name: parsed.data.name,
    sourcePdfPath: req.file.path,
    createdBy: req.user!.id,
  });

  ok(res, template);
});

staffTemplatesRouter.get('/:id', (req, res) => {
  try {
    const template = getTemplateWithFields(req.params.id, req.user!.practiceId);
    ok(res, template);
  } catch {
    fail(res, 'NOT_FOUND', 'Template not found', 404);
  }
});

staffTemplatesRouter.delete('/:id', (req, res) => {
  try {
    const deleted = deleteTemplateVersion({
      templateId: req.params.id,
      practiceId: req.user!.practiceId,
    });

    try {
      if (deleted.source_pdf_path && fs.existsSync(deleted.source_pdf_path)) {
        fs.unlinkSync(deleted.source_pdf_path);
      }
      if (deleted.acroform_pdf_path && fs.existsSync(deleted.acroform_pdf_path)) {
        fs.unlinkSync(deleted.acroform_pdf_path);
      }
      const templateDir = path.join(config.rootPath, 'apps', 'data', 'templates', deleted.id);
      if (fs.existsSync(templateDir)) {
        fs.rmSync(templateDir, { recursive: true, force: true });
      }
    } catch {
      // non-blocking filesystem cleanup
    }

    ok(res, {
      deleted: true,
      id: deleted.id,
      version: deleted.version,
      template_key: deleted.template_key,
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('published template version')) {
      fail(res, 'VALIDATION_ERROR', message, 409);
      return;
    }
    fail(res, 'DELETE_ERROR', message, 400);
  }
});

const fieldSchema = z.object({
  field_id: z.string().min(1).optional(),
  field_name: z.string().min(1),
  field_type: z.enum(['text', 'textarea', 'checkbox', 'radio', 'select', 'date', 'signature']),
  acro_field_name: z.string().min(1).optional(),
  required: z.boolean().optional(),
  page_number: z.number().int().min(1).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  options_json: z.array(z.string()).optional(),
  validation_json: z.record(z.unknown()).optional(),
  section_key: z.string().optional(),
  display_order: z.number().int().optional(),
});

const allowedFieldTypes = new Set(['text', 'textarea', 'checkbox', 'radio', 'select', 'date', 'signature'] as const);

function formatIssues(issues: string[]): string {
  return issues.join('; ');
}

function firstDefined(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined) return raw[key];
  }
  return undefined;
}

function normalizeFieldPayload(body: unknown): Record<string, unknown> {
  let base: Record<string, unknown> = {};

  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    base = body as Record<string, unknown>;
  } else if (typeof body === 'string' && body.trim()) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore invalid json body; validation will report missing fields
    }
  }

  const nested = base.field;
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    return { ...base, ...(nested as Record<string, unknown>) };
  }

  return base;
}

function parseBooleanField(value: unknown, fieldName: string, issues: string[], fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  issues.push(`${fieldName}: must be a boolean`);
  return fallback;
}

function parseNumberField(
  value: unknown,
  fieldName: string,
  issues: string[],
  input: {
    fallback: number;
    min?: number;
    integer?: boolean;
  },
): number {
  if (value === undefined || value === null || value === '') return input.fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    issues.push(`${fieldName}: must be a valid number`);
    return input.fallback;
  }
  if (input.integer && !Number.isInteger(n)) {
    issues.push(`${fieldName}: must be an integer`);
    return input.fallback;
  }
  if (input.min !== undefined && n < input.min) {
    issues.push(`${fieldName}: must be >= ${input.min}`);
    return input.fallback;
  }
  return n;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function parseValidationObject(value: unknown, issues: string[]): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      issues.push('validation_json: must be a JSON object');
      return {};
    } catch {
      issues.push('validation_json: must be valid JSON');
      return {};
    }
  }
  issues.push('validation_json: must be an object');
  return {};
}

function friendlyTemplateFieldDbError(error: Error): string {
  const message = error.message ?? 'Update failed';
  if (message.includes('pdf_template_fields.template_id, pdf_template_fields.acro_field_name')) {
    return 'acro_field_name must be unique within this template';
  }
  if (message.includes('pdf_template_fields.template_id, pdf_template_fields.field_id')) {
    return 'field_id must be unique within this template';
  }
  return message;
}

function toSnakeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function buildUniqueId(base: string, existing: Set<string>): string {
  const normalizedBase = toSnakeId(base) || 'field';
  if (!existing.has(normalizedBase)) return normalizedBase;
  let index = 2;
  while (existing.has(`${normalizedBase}_${index}`)) {
    index += 1;
  }
  return `${normalizedBase}_${index}`;
}

staffTemplatesRouter.post('/:id/fields', (req, res) => {
  const raw = normalizeFieldPayload(req.body);
  const issues: string[] = [];

  const fieldName = String(firstDefined(raw, 'field_name', 'fieldName', 'label') ?? '').trim();
  if (!fieldName) {
    issues.push('field_name: is required');
  }

  const fieldTypeRaw = String(firstDefined(raw, 'field_type', 'fieldType') ?? 'text')
    .trim()
    .toLowerCase();
  const fieldType = fieldTypeRaw || 'text';
  if (!allowedFieldTypes.has(fieldType as any)) {
    issues.push(`field_type: must be one of ${Array.from(allowedFieldTypes).join(', ')}`);
  }

  const pageNumber = parseNumberField(firstDefined(raw, 'page_number', 'pageNumber'), 'page_number', issues, {
    fallback: 1,
    min: 1,
    integer: true,
  });
  const x = parseNumberField(firstDefined(raw, 'x'), 'x', issues, { fallback: 50, min: 0 });
  const y = parseNumberField(firstDefined(raw, 'y'), 'y', issues, { fallback: 700, min: 0 });
  const width = parseNumberField(firstDefined(raw, 'width'), 'width', issues, { fallback: 180, min: 10 });
  const height = parseNumberField(firstDefined(raw, 'height'), 'height', issues, { fallback: 18, min: 10 });
  const displayOrder = parseNumberField(firstDefined(raw, 'display_order', 'displayOrder'), 'display_order', issues, {
    fallback: 0,
    min: 0,
    integer: true,
  });
  const required = parseBooleanField(firstDefined(raw, 'required'), 'required', issues, false);

  const optionsSource = firstDefined(raw, 'options_json', 'options');
  if (optionsSource !== undefined && optionsSource !== null) {
    const validOptions = Array.isArray(optionsSource) || typeof optionsSource === 'string';
    if (!validOptions) {
      issues.push('options_json: must be an array of strings or comma-separated string');
    }
  }
  const options = asStringArray(optionsSource);
  const validation = parseValidationObject(firstDefined(raw, 'validation_json', 'validationJson', 'validation_rules'), issues);
  const sectionKey = String(firstDefined(raw, 'section_key', 'sectionKey') ?? 'General').trim() || 'General';
  const requestedAcroFieldName = String(firstDefined(raw, 'acro_field_name', 'acroFieldName') ?? '').trim();

  if (issues.length > 0) {
    fail(res, 'VALIDATION_ERROR', formatIssues(issues), 422, {
      issues,
      received_keys: Object.keys(raw),
      hint: 'Accepted aliases: field_name|fieldName, field_type|fieldType, page_number|pageNumber, acro_field_name|acroFieldName',
    });
    return;
  }

  try {
    const existing = new Set(getTemplateFields(req.params.id).map((field) => field.field_id));
    const fieldId = buildUniqueId(String(firstDefined(raw, 'field_id', 'fieldId') ?? fieldName), existing);
    const acroFieldName = requestedAcroFieldName || fieldId;

    const template = addTemplateField({
      templateId: req.params.id,
      practiceId: req.user!.practiceId,
      field: {
        field_id: fieldId,
        field_name: fieldName,
        field_type: fieldType,
        acro_field_name: acroFieldName,
        required,
        page_number: pageNumber,
        x,
        y,
        width,
        height,
        options_json: options,
        validation_json: validation,
        section_key: sectionKey,
        display_order: displayOrder,
      },
    });
    ok(res, template);
  } catch (error) {
    fail(res, 'UPDATE_ERROR', friendlyTemplateFieldDbError(error as Error), 400);
  }
});

staffTemplatesRouter.patch('/:id/fields/:fieldDbId', (req, res) => {
  const parsed = fieldSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `${path || 'payload'}: ${issue.message}`;
    });
    fail(res, 'VALIDATION_ERROR', formatIssues(issues), 422, {
      issues,
      zod: parsed.error.flatten(),
    });
    return;
  }

  try {
    const template = updateTemplateField({
      templateId: req.params.id,
      practiceId: req.user!.practiceId,
      fieldDbId: req.params.fieldDbId,
      patch: parsed.data,
    });
    ok(res, template);
  } catch (error) {
    fail(res, 'UPDATE_ERROR', friendlyTemplateFieldDbError(error as Error), 400);
  }
});

staffTemplatesRouter.delete('/:id/fields/:fieldDbId', (req, res) => {
  try {
    const template = deleteTemplateField({
      templateId: req.params.id,
      practiceId: req.user!.practiceId,
      fieldDbId: req.params.fieldDbId,
    });
    ok(res, template);
  } catch (error) {
    fail(res, 'UPDATE_ERROR', (error as Error).message, 400);
  }
});

staffTemplatesRouter.post('/:id/generate-acroform', async (req, res) => {
  try {
    const template = getTemplateWithFields(req.params.id, req.user!.practiceId) as any;
    const outputDir = path.join(config.rootPath, 'apps', 'data', 'templates', template.id);
    fs.mkdirSync(outputDir, { recursive: true });
    const outPath = path.join(outputDir, `acroform_v${template.version}.pdf`);

    await buildAcroformPdfFromFieldDefinitions({
      sourcePdfPath: template.source_pdf_path,
      outputPdfPath: outPath,
      fields: template.fields,
    });

    const updated = setTemplateAcroformPath({
      templateId: template.id,
      practiceId: req.user!.practiceId,
      acroformPdfPath: outPath,
    });

    ok(res, {
      ...updated,
      acroform_pdf_path: outPath,
    });
  } catch (error) {
    fail(res, 'ACROFORM_GENERATION_ERROR', (error as Error).message, 500);
  }
});

staffTemplatesRouter.post('/:id/publish', (req, res) => {
  try {
    const template = getTemplateById(req.params.id, req.user!.practiceId);
    if (!template) {
      fail(res, 'NOT_FOUND', 'Template not found', 404);
      return;
    }

    if (!template.acroform_pdf_path || !fs.existsSync(template.acroform_pdf_path)) {
      fail(res, 'VALIDATION_ERROR', 'Generate AcroForm PDF before publish', 422);
      return;
    }

    const published = publishTemplate({
      templateId: req.params.id,
      practiceId: req.user!.practiceId,
      publishedBy: req.user!.id,
    });

    ok(res, published);
  } catch (error) {
    fail(res, 'PUBLISH_ERROR', (error as Error).message, 500);
  }
});

staffTemplatesRouter.get('/:id/source', (req, res) => {
  const template = getTemplateById(req.params.id, req.user!.practiceId);
  if (!template) {
    fail(res, 'NOT_FOUND', 'Template not found', 404);
    return;
  }
  res.sendFile(path.resolve(template.source_pdf_path));
});

staffTemplatesRouter.get('/:id/acroform', (req, res) => {
  const template = getTemplateById(req.params.id, req.user!.practiceId);
  if (!template?.acroform_pdf_path) {
    fail(res, 'NOT_FOUND', 'AcroForm PDF not available', 404);
    return;
  }
  res.sendFile(path.resolve(template.acroform_pdf_path));
});
