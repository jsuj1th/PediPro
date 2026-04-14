import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, nowIso } from './database.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEEDS_DIR = path.join(__dirname, '..', 'seeds');
const PDFS_DIR = path.join(SEEDS_DIR, 'pdfs');
const DATA_FILE = path.join(SEEDS_DIR, 'templateSeedData.json');

type TemplateRecord = {
  id: string;
  template_key: string;
  version: number;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type FieldRecord = {
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
  font_size: number;
  group_id: string | null;
  group_value: string | null;
  parent_field_id: string | null;
};

type GroupRecord = {
  id: string;
  template_id: string;
  group_type: string;
  group_name: string;
  acro_group_name: string;
  created_at: string;
};

// Map from template ID to bundled PDF filenames
const PDF_FILES: Record<string, { source: string; acroform: string }> = {
  '1da4ed73-bd00-4e1f-9d42-ed10ffa2253b': {
    source: 'patient_registration_source.pdf',
    acroform: 'patient_registration_acroform.pdf',
  },
  '30684745-8590-471d-b842-e3eb6d5c16cd': {
    source: 'asq9mos_source.pdf',
    acroform: 'asq9mos_acroform.pdf',
  },
  '9b6d260c-9659-4740-85df-38c81bd7ceda': {
    source: 'asq30_source.pdf',
    acroform: 'asq30_acroform.pdf',
  },
};

export function seedTemplates(): void {
  // Skip if any templates already exist
  const existing = db.prepare('select count(*) as n from pdf_templates').get() as { n: number };
  if (existing.n > 0) return;

  if (!fs.existsSync(DATA_FILE) || !fs.existsSync(PDFS_DIR)) return;

  const practice = db
    .prepare('select id from practices where slug = ?')
    .get('sunshine-pediatrics') as { id: string } | undefined;
  if (!practice) return;

  const staff = db
    .prepare('select id from staff_users where email = ?')
    .get('admin@sunshineclinic.com') as { id: string } | undefined;
  if (!staff) return;

  const { templates, fields, groups } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as {
    templates: TemplateRecord[];
    fields: FieldRecord[];
    groups: GroupRecord[];
  };

  const insertTemplate = db.prepare(`
    insert or ignore into pdf_templates
      (id, practice_id, template_key, version, name, source_pdf_path, acroform_pdf_path,
       status, created_by, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertField = db.prepare(`
    insert or ignore into pdf_template_fields
      (id, template_id, field_id, field_name, field_type, acro_field_name, required,
       page_number, x, y, width, height, options_json, validation_json, section_key,
       display_order, font_size, group_id, group_value, parent_field_id, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertGroup = db.prepare(`
    insert or ignore into field_groups
      (id, template_id, group_type, group_name, acro_group_name, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const t of templates) {
      const pdfs = PDF_FILES[t.id];
      if (!pdfs) continue;

      // Copy PDFs from bundle into DATA_PATH
      const sourceDir = path.join(config.dataPath, 'templates', 'source');
      const acroformDir = path.join(config.dataPath, 'templates', t.id);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(acroformDir, { recursive: true });

      const sourceRelPath = `templates/source/${pdfs.source}`;
      const acroformRelPath = `templates/${t.id}/acroform_v${t.version}.pdf`;

      const sourceDestPath = path.join(config.dataPath, sourceRelPath);
      const acroformDestPath = path.join(config.dataPath, acroformRelPath);

      const bundledSource = path.join(PDFS_DIR, pdfs.source);
      const bundledAcroform = path.join(PDFS_DIR, pdfs.acroform);

      if (fs.existsSync(bundledSource) && !fs.existsSync(sourceDestPath)) {
        fs.copyFileSync(bundledSource, sourceDestPath);
      }
      if (fs.existsSync(bundledAcroform) && !fs.existsSync(acroformDestPath)) {
        fs.copyFileSync(bundledAcroform, acroformDestPath);
      }

      insertTemplate.run(
        t.id, practice.id, t.template_key, t.version, t.name,
        sourceRelPath, acroformRelPath,
        t.status, staff.id, t.created_at, t.updated_at,
      );
    }

    for (const g of groups) {
      insertGroup.run(
        g.id, g.template_id, g.group_type, g.group_name, g.acro_group_name,
        g.created_at, nowIso(),
      );
    }

    for (const f of fields) {
      insertField.run(
        f.id, f.template_id, f.field_id, f.field_name, f.field_type,
        f.acro_field_name, f.required, f.page_number,
        f.x, f.y, f.width, f.height,
        f.options_json, f.validation_json, f.section_key,
        f.display_order, f.font_size ?? 12,
        f.group_id ?? null, f.group_value ?? null, f.parent_field_id ?? null,
        nowIso(), nowIso(),
      );
    }
  });

  seedAll();
}
