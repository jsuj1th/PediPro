import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';

const fieldSchema = z.object({
  field_id: z.string(),
  label: z.string(),
  input_type: z.string(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  validation_rules: z.record(z.unknown()).optional(),
  default_value: z.unknown().optional(),
  ui: z.record(z.unknown()).optional(),
  data_path: z.string(),
});

const templateSchema = z.object({
  form_id: z.string(),
  version: z.string(),
  title: z.string(),
  steps: z.array(
    z.object({
      step_id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      fields: z.array(fieldSchema),
    }),
  ),
});

export type FormTemplate = z.infer<typeof templateSchema>;

export function loadTemplate(formId: string): FormTemplate {
  const templatePath = path.join(config.rootPath, 'templates', 'forms', `${formId}.json`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${formId}`);
  }

  const raw = fs.readFileSync(templatePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return templateSchema.parse(parsed);
}

export function listTemplateIds(): string[] {
  const folder = path.join(config.rootPath, 'templates', 'forms');
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''));
}
