import fs from 'node:fs';
import path from 'node:path';

export type AcroField = {
  field_id: string;
  field_name: string;
  field_type: string;
  acro_field_name: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  options_json?: string | unknown[];
  font_size?: number | null;
  group_id?: string | null;
  group_value?: string | null;
};

export type AcroGroup = {
  id: string;
  group_type: string;
  group_name: string;
  acro_group_name: string;
};

type Responses = Record<string, { value: unknown; updated_at?: string } | unknown>;

async function getPdfLib() {
  try {
    return await import('pdf-lib');
  } catch {
    throw new Error("Missing dependency 'pdf-lib'. Run: npm install");
  }
}

function asOptions(value: string | unknown[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

export async function buildAcroformPdfFromFieldDefinitions(input: {
  sourcePdfPath: string;
  outputPdfPath: string;
  fields: AcroField[];
  groups?: AcroGroup[];
}): Promise<void> {
  if (!fs.existsSync(input.sourcePdfPath)) {
    throw new Error('Source PDF not found.');
  }

  const { PDFDocument } = await getPdfLib();
  const src = fs.readFileSync(input.sourcePdfPath);
  const pdfDoc = await PDFDocument.load(src);
  const pages = pdfDoc.getPages();
  const form = pdfDoc.getForm();

  // Build group lookup: id → acro_group_name
  const groupAcroName = new Map<string, string>();
  for (const g of (input.groups ?? [])) {
    groupAcroName.set(g.id, g.acro_group_name);
  }

  // Pre-process radio_option fields: group by group_id
  const radioOptionsByGroup = new Map<string, AcroField[]>();
  for (const field of input.fields) {
    if (field.field_type === 'radio_option' && field.group_id) {
      const bucket = radioOptionsByGroup.get(field.group_id) ?? [];
      bucket.push(field);
      radioOptionsByGroup.set(field.group_id, bucket);
    }
  }

  // Create radio groups for radio_option fields
  for (const [gid, options] of radioOptionsByGroup) {
    const acroName = groupAcroName.get(gid);
    if (!acroName) continue;
    const radio = form.createRadioGroup(acroName);
    for (const opt of options) {
      const page = pages[Math.max(0, Number(opt.page_number || 1) - 1)];
      if (!page) continue;
      const x = Number(opt.x ?? 0);
      const y = Number(opt.y ?? 0);
      const sz = Math.max(10, Math.min(Number(opt.width ?? 14), Number(opt.height ?? 14)));
      radio.addOptionToPage(opt.group_value ?? opt.field_id, page, { x, y, width: sz, height: sz });
    }
  }

  // Process remaining fields
  for (const field of input.fields) {
    if (field.field_type === 'radio_option') continue; // already handled above

    const page = pages[Math.max(0, Number(field.page_number || 1) - 1)];
    if (!page) continue;

    const x = Number(field.x ?? 0);
    const y = Number(field.y ?? 0);
    const width = Math.max(10, Number(field.width ?? 120));
    const height = Math.max(10, Number(field.height ?? 18));
    const fontSize = Number(field.font_size ?? 12);

    if (field.field_type === 'checkbox') {
      const cb = form.createCheckBox(field.acro_field_name);
      cb.addToPage(page, { x, y, width: Math.min(width, height), height: Math.min(width, height) });
      continue;
    }

    if (field.field_type === 'radio') {
      const radio = form.createRadioGroup(field.acro_field_name);
      const options = asOptions(field.options_json);
      if (options.length === 0) {
        radio.addOptionToPage('Yes', page, { x, y, width: 12, height: 12 });
      } else {
        options.forEach((option, idx) => {
          radio.addOptionToPage(option, page, {
            x,
            y: y - idx * (Math.max(height, 12) + 4),
            width: 12,
            height: 12,
          });
        });
      }
      continue;
    }

    if (field.field_type === 'select') {
      const dd = form.createDropdown(field.acro_field_name);
      dd.addToPage(page, { x, y, width, height });
      const options = asOptions(field.options_json);
      if (options.length > 0) dd.addOptions(options);
      continue;
    }

    // text, textarea, date, signature, box_char
    const text = form.createTextField(field.acro_field_name);
    text.addToPage(page, { x, y, width, height });
    if (fontSize > 0) {
      try { text.setFontSize(fontSize); } catch { /* ignore if font not embedded */ }
    }
    if (field.field_type === 'textarea') {
      text.enableMultiline();
    }
    if (field.field_type === 'box_char') {
      text.setMaxLength(1);
    }
  }

  fs.mkdirSync(path.dirname(input.outputPdfPath), { recursive: true });
  const out = await pdfDoc.save();
  fs.writeFileSync(input.outputPdfPath, out);
}

function valueFromResponse(entry: unknown): string | boolean | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'object' && entry !== null && 'value' in (entry as Record<string, unknown>)) {
    const v = (entry as Record<string, unknown>).value;
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined) return null;
    return String(v);
  }
  if (typeof entry === 'boolean') return entry;
  return String(entry);
}

export async function fillAcroformPdfWithResponses(input: {
  acroformPdfPath: string;
  fields: AcroField[];
  responses: Responses;
  groups?: AcroGroup[];
}): Promise<Uint8Array> {
  if (!fs.existsSync(input.acroformPdfPath)) {
    throw new Error('AcroForm PDF not found.');
  }

  const { PDFDocument } = await getPdfLib();
  const src = fs.readFileSync(input.acroformPdfPath);
  const pdfDoc = await PDFDocument.load(src);
  const form = pdfDoc.getForm();

  // Build group lookup: id → acro_group_name
  const groupAcroName = new Map<string, string>();
  for (const g of (input.groups ?? [])) {
    groupAcroName.set(g.id, g.acro_group_name);
  }

  // For radio_option fields, the response is stored per group_id (which option is selected)
  const filledRadioGroups = new Set<string>();

  for (const field of input.fields) {
    const responseVal = valueFromResponse(input.responses[field.field_id]);

    try {
      if (field.field_type === 'radio_option' && field.group_id) {
        // Each radio option field stores its own checked state (true/false)
        // The acro radio group stores the currently selected option value
        if (!filledRadioGroups.has(field.group_id)) {
          const acroName = groupAcroName.get(field.group_id);
          if (acroName) {
            // Find the selected option value from responses across all options in this group
            const selectedVal = valueFromResponse(input.responses[`__group_${field.group_id}`]);
            if (selectedVal) {
              const radio = form.getRadioGroup(acroName);
              radio.select(String(selectedVal));
            }
            filledRadioGroups.add(field.group_id);
          }
        }
        continue;
      }

      if (responseVal === null || responseVal === '') continue;

      if (field.field_type === 'checkbox') {
        const cb = form.getCheckBox(field.acro_field_name);
        if (responseVal === true || responseVal === 'true' || responseVal === '1') cb.check();
        else cb.uncheck();
        continue;
      }

      if (field.field_type === 'radio') {
        const radio = form.getRadioGroup(field.acro_field_name);
        radio.select(String(responseVal));
        continue;
      }

      if (field.field_type === 'select') {
        const dd = form.getDropdown(field.acro_field_name);
        dd.select(String(responseVal));
        continue;
      }

      // text, textarea, date, signature, box_char
      const text = form.getTextField(field.acro_field_name);
      text.setText(String(responseVal));
    } catch {
      // Ignore missing/invalid field binding at runtime; validation should catch these before publish.
    }
  }

  form.flatten();
  return pdfDoc.save();
}
