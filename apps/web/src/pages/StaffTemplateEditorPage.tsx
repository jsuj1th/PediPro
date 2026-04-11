import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, authHeader } from '../lib/api';
import { PdfFieldMapper } from '../components/PdfFieldMapper';

type Props = {
  token: string | null;
};

type TemplateField = {
  id: string;
  field_id: string;
  field_name: string;
  field_type: 'text' | 'textarea' | 'checkbox' | 'radio' | 'select' | 'date' | 'signature';
  acro_field_name: string;
  required: boolean;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  options_json: string[];
  validation_json: Record<string, unknown>;
  section_key: string;
  display_order: number;
};

type TemplateDetail = {
  id: string;
  template_key: string;
  version: number;
  name: string;
  status: 'draft' | 'published' | 'archived';
  source_pdf_path: string;
  acroform_pdf_path: string | null;
  fields: TemplateField[];
};

type EditableField = {
  id?: string;
  field_id: string;
  field_name: string;
  field_type: TemplateField['field_type'];
  acro_field_name: string;
  required: boolean;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  options_csv: string;
  validation_text: string;
  section_key: string;
  display_order: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

function toEditableField(field: TemplateField): EditableField {
  return {
    id: field.id,
    field_id: field.field_id,
    field_name: field.field_name,
    field_type: field.field_type,
    acro_field_name: field.acro_field_name,
    required: Boolean(field.required),
    page_number: Number(field.page_number ?? 1),
    x: Number(field.x ?? 0),
    y: Number(field.y ?? 0),
    width: Number(field.width ?? 120),
    height: Number(field.height ?? 18),
    options_csv: (field.options_json ?? []).join(', '),
    validation_text: JSON.stringify(field.validation_json ?? {}, null, 2),
    section_key: field.section_key ?? 'General',
    display_order: Number(field.display_order ?? 0),
  };
}

function emptyField(): EditableField {
  return {
    field_id: '',
    field_name: '',
    field_type: 'text',
    acro_field_name: '',
    required: false,
    page_number: 1,
    x: 60,
    y: 700,
    width: 180,
    height: 18,
    options_csv: '',
    validation_text: '{}',
    section_key: 'General',
    display_order: 0,
  };
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseValidationJson(value: string): Record<string, unknown> {
  const text = value.trim();
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error('validation_json must be a JSON object');
}

function ensureFiniteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function toSnakeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function buildUniqueFieldId(base: string, existingIds: Set<string>): string {
  const normalizedBase = toSnakeId(base) || 'field';
  if (!existingIds.has(normalizedBase)) return normalizedBase;
  let index = 2;
  while (existingIds.has(`${normalizedBase}_${index}`)) {
    index += 1;
  }
  return `${normalizedBase}_${index}`;
}

function buildFieldPayload(draft: EditableField, existingIds: Set<string>, currentFieldId?: string) {
  const generatedFromName = buildUniqueFieldId(
    draft.field_id.trim() || draft.field_name.trim(),
    new Set([...existingIds].filter((id) => id !== (currentFieldId ?? ''))),
  );
  const fieldId = currentFieldId ? draft.field_id.trim() || currentFieldId : generatedFromName;

  const fieldName = draft.field_name.trim();
  if (!fieldName) throw new Error('Question label is required.');

  const acroFieldName = draft.acro_field_name.trim() || fieldId;
  const validationJson = parseValidationJson(draft.validation_text);

  return {
    field_id: fieldId,
    field_name: fieldName,
    field_type: draft.field_type,
    acro_field_name: acroFieldName,
    required: draft.required,
    page_number: Math.max(1, Math.round(ensureFiniteNumber(Number(draft.page_number), 1))),
    x: Math.max(0, ensureFiniteNumber(Number(draft.x), 0)),
    y: Math.max(0, ensureFiniteNumber(Number(draft.y), 0)),
    width: Math.max(10, ensureFiniteNumber(Number(draft.width), 120)),
    height: Math.max(10, ensureFiniteNumber(Number(draft.height), 18)),
    options_json: parseCsv(draft.options_csv),
    validation_json: validationJson,
    section_key: draft.section_key.trim() || 'General',
    display_order: Math.max(0, Math.round(ensureFiniteNumber(Number(draft.display_order), 0))),
  };
}

export function StaffTemplateEditorPage({ token }: Props) {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [newField, setNewField] = useState<EditableField>(() => emptyField());
  const [editing, setEditing] = useState<Record<string, EditableField>>({});

  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [acroPreviewUrl, setAcroPreviewUrl] = useState<string | null>(null);

  async function loadTemplate() {
    if (!token) return;
    setError('');
    try {
      const detail = await api<TemplateDetail>(`/api/staff/templates/${id}`, {
        headers: authHeader(token),
      });
      setTemplate(detail);
      const mapped: Record<string, EditableField> = {};
      for (const field of detail.fields ?? []) {
        mapped[field.id] = toEditableField(field);
      }
      setEditing(mapped);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!token) {
      navigate('/staff/login');
      return;
    }
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  useEffect(() => {
    return () => {
      if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
      if (acroPreviewUrl) URL.revokeObjectURL(acroPreviewUrl);
    };
  }, [sourcePreviewUrl, acroPreviewUrl]);

  const sortedFields = useMemo(() => {
    return [...(template?.fields ?? [])].sort((a, b) => {
      if ((a.section_key ?? '') !== (b.section_key ?? '')) {
        return (a.section_key ?? '').localeCompare(b.section_key ?? '');
      }
      return Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
    });
  }, [template]);

  const existingFieldIds = useMemo(() => new Set((template?.fields ?? []).map((field) => field.field_id)), [template]);

  const autoDraftFieldId = useMemo(() => {
    return buildUniqueFieldId(newField.field_id.trim() || newField.field_name.trim(), existingFieldIds);
  }, [newField.field_id, newField.field_name, existingFieldIds]);

  async function addField() {
    if (!token || !template) return;
    setError('');

    try {
      const payload = buildFieldPayload(
        {
          ...newField,
          field_id: autoDraftFieldId,
        },
        existingFieldIds,
      );
      setSaving('new-field');
      await api(`/api/staff/templates/${template.id}/fields`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify(payload),
      });

      setNewField(emptyField());
      await loadTemplate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving('');
    }
  }

  async function saveField(fieldDbId: string) {
    if (!token || !template) return;
    const draft = editing[fieldDbId];
    if (!draft) return;

    setError('');
    try {
      const payload = buildFieldPayload(draft, existingFieldIds, fieldDbId ? (template.fields.find((f) => f.id === fieldDbId)?.field_id ?? undefined) : undefined);
      setSaving(`field-${fieldDbId}`);
      await api(`/api/staff/templates/${template.id}/fields/${fieldDbId}`, {
        method: 'PATCH',
        headers: authHeader(token),
        body: JSON.stringify(payload),
      });
      await loadTemplate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving('');
    }
  }

  async function deleteField(fieldDbId: string) {
    if (!token || !template) return;
    setError('');

    try {
      setSaving(`delete-${fieldDbId}`);
      await api(`/api/staff/templates/${template.id}/fields/${fieldDbId}`, {
        method: 'DELETE',
        headers: authHeader(token),
      });
      await loadTemplate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving('');
    }
  }

  async function generateAcroform() {
    if (!token || !template) return;
    setError('');

    try {
      setSaving('generate');
      await api(`/api/staff/templates/${template.id}/generate-acroform`, {
        method: 'POST',
        headers: authHeader(token),
      });
      await loadTemplate();
      await loadPreview('acroform');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving('');
    }
  }

  async function publishTemplate() {
    if (!token || !template) return;
    setError('');

    try {
      setSaving('publish');
      await api(`/api/staff/templates/${template.id}/publish`, {
        method: 'POST',
        headers: authHeader(token),
      });
      await loadTemplate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving('');
    }
  }

  async function loadPreview(kind: 'source' | 'acroform') {
    if (!token || !template) return;
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/staff/templates/${template.id}/${kind}`, {
        headers: authHeader(token),
      });

      if (!response.ok) {
        let message = `Failed to load ${kind} PDF`;
        try {
          const payload = await response.json();
          message = payload?.error?.message ?? message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (kind === 'source') {
        if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
        setSourcePreviewUrl(objectUrl);
      } else {
        if (acroPreviewUrl) URL.revokeObjectURL(acroPreviewUrl);
        setAcroPreviewUrl(objectUrl);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!template) {
    return (
      <div className="container">
        <div className="card">
          <p>Loading template editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <Link to="/staff/templates">← Back to Templates</Link>
        <h2>
          {template.name} (v{template.version})
        </h2>
        <p>
          Key: <span className="badge">{template.template_key}</span> Status: <span className="badge">{template.status}</span>
        </p>

        {error ? <div className="error">{error}</div> : null}

        <div className="actions" style={{ gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))' }}>
          <button className="secondary" onClick={() => loadPreview('source')}>
            Preview Source
          </button>
          <button className="secondary" onClick={() => loadPreview('acroform')}>
            Preview AcroForm
          </button>
          <button onClick={generateAcroform} disabled={saving === 'generate'}>
            {saving === 'generate' ? 'Generating...' : 'Generate AcroForm'}
          </button>
          <button onClick={publishTemplate} disabled={saving === 'publish'}>
            {saving === 'publish' ? 'Publishing...' : 'Publish Version'}
          </button>
        </div>

        <h3 style={{ marginTop: 24 }}>Add Field</h3>
        <PdfFieldMapper
          templateId={template.id}
          token={token!}
          fields={template.fields ?? []}
          draftField={{
            field_id: autoDraftFieldId,
            field_name: newField.field_name,
            page_number: newField.page_number,
            x: newField.x,
            y: newField.y,
            width: newField.width,
            height: newField.height,
          }}
          onPageChange={(pageNumber) => setNewField((prev) => ({ ...prev, page_number: pageNumber }))}
          onPositionPick={({ x, y, width, height, page_number }) =>
            setNewField((prev) => ({
              ...prev,
              x,
              y,
              width,
              height,
              page_number,
            }))
          }
        />

        <div className="row">
          <div className="field">
            <label>Field ID (Auto)</label>
            <input value={autoDraftFieldId} readOnly />
          </div>
          <div className="field">
            <label>Question Label (field_name)</label>
            <input
              value={newField.field_name}
              onChange={(event) => setNewField((prev) => ({ ...prev, field_name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Acro Field Name</label>
            <input
              value={newField.acro_field_name}
              onChange={(event) => setNewField((prev) => ({ ...prev, acro_field_name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={newField.field_type}
              onChange={(event) => setNewField((prev) => ({ ...prev, field_type: event.target.value as TemplateField['field_type'] }))}
            >
              <option value="text">text</option>
              <option value="textarea">textarea</option>
              <option value="checkbox">checkbox</option>
              <option value="radio">radio</option>
              <option value="select">select</option>
              <option value="date">date</option>
              <option value="signature">signature</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Section</label>
            <input value={newField.section_key} onChange={(event) => setNewField((prev) => ({ ...prev, section_key: event.target.value }))} />
          </div>
          <div className="field">
            <label>Display Order</label>
            <input
              type="number"
              value={newField.display_order}
              onChange={(event) => setNewField((prev) => ({ ...prev, display_order: Number(event.target.value) || 0 }))}
            />
          </div>
          <div className="field">
            <label>Page Number</label>
            <input
              type="number"
              value={newField.page_number}
              onChange={(event) => setNewField((prev) => ({ ...prev, page_number: Number(event.target.value) || 1 }))}
            />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'end' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={newField.required}
                onChange={(event) => setNewField((prev) => ({ ...prev, required: event.target.checked }))}
                style={{ width: 18, height: 18 }}
              />
              <span>Required</span>
            </label>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>X</label>
            <input type="number" value={newField.x} onChange={(event) => setNewField((prev) => ({ ...prev, x: Number(event.target.value) || 0 }))} />
          </div>
          <div className="field">
            <label>Y</label>
            <input type="number" value={newField.y} onChange={(event) => setNewField((prev) => ({ ...prev, y: Number(event.target.value) || 0 }))} />
          </div>
          <div className="field">
            <label>Width</label>
            <input
              type="number"
              value={newField.width}
              onChange={(event) => setNewField((prev) => ({ ...prev, width: Number(event.target.value) || 120 }))}
            />
          </div>
          <div className="field">
            <label>Height</label>
            <input
              type="number"
              value={newField.height}
              onChange={(event) => setNewField((prev) => ({ ...prev, height: Number(event.target.value) || 18 }))}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Options (comma-separated)</label>
            <input
              value={newField.options_csv}
              onChange={(event) => setNewField((prev) => ({ ...prev, options_csv: event.target.value }))}
              placeholder="Yes, No"
            />
          </div>
          <div className="field">
            <label>Validation JSON</label>
            <textarea
              value={newField.validation_text}
              onChange={(event) => setNewField((prev) => ({ ...prev, validation_text: event.target.value }))}
              style={{ minHeight: 80 }}
            />
          </div>
        </div>

        <button onClick={addField} disabled={saving === 'new-field'}>
          {saving === 'new-field' ? 'Adding...' : 'Add Field'}
        </button>

        <h3 style={{ marginTop: 24 }}>Fields</h3>
        {sortedFields.length === 0 ? <p>No fields yet.</p> : null}

        {sortedFields.map((field) => {
          const draft = editing[field.id] ?? toEditableField(field);
          return (
            <div key={field.id} className="card" style={{ marginBottom: 12, background: '#f9fbff' }}>
              <div className="row">
                <div className="field">
                  <label>Field ID</label>
                  <input value={draft.field_id} readOnly />
                </div>
                <div className="field">
                  <label>Question Label</label>
                  <input
                    value={draft.field_name}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, field_name: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Acro Name</label>
                  <input
                    value={draft.acro_field_name}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, acro_field_name: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select
                    value={draft.field_type}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, field_type: event.target.value as TemplateField['field_type'] },
                      }))
                    }
                  >
                    <option value="text">text</option>
                    <option value="textarea">textarea</option>
                    <option value="checkbox">checkbox</option>
                    <option value="radio">radio</option>
                    <option value="select">select</option>
                    <option value="date">date</option>
                    <option value="signature">signature</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label>Section</label>
                  <input
                    value={draft.section_key}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, section_key: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Display Order</label>
                  <input
                    type="number"
                    value={draft.display_order}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, display_order: Number(event.target.value) || 0 },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Page</label>
                  <input
                    type="number"
                    value={draft.page_number}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, page_number: Number(event.target.value) || 1 },
                      }))
                    }
                  />
                </div>
                <div className="field" style={{ display: 'flex', alignItems: 'end' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={draft.required}
                      onChange={(event) =>
                        setEditing((prev) => ({
                          ...prev,
                          [field.id]: { ...draft, required: event.target.checked },
                        }))
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    <span>Required</span>
                  </label>
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label>X</label>
                  <input
                    type="number"
                    value={draft.x}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, x: Number(event.target.value) || 0 },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Y</label>
                  <input
                    type="number"
                    value={draft.y}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, y: Number(event.target.value) || 0 },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Width</label>
                  <input
                    type="number"
                    value={draft.width}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, width: Number(event.target.value) || 120 },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Height</label>
                  <input
                    type="number"
                    value={draft.height}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, height: Number(event.target.value) || 18 },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label>Options (comma-separated)</label>
                  <input
                    value={draft.options_csv}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, options_csv: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Validation JSON</label>
                  <textarea
                    value={draft.validation_text}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [field.id]: { ...draft, validation_text: event.target.value },
                      }))
                    }
                    style={{ minHeight: 80 }}
                  />
                </div>
              </div>

              <div className="actions">
                <button onClick={() => saveField(field.id)} disabled={saving === `field-${field.id}`}>
                  {saving === `field-${field.id}` ? 'Saving...' : 'Save Field'}
                </button>
                <button className="secondary" onClick={() => deleteField(field.id)} disabled={saving === `delete-${field.id}`}>
                  {saving === `delete-${field.id}` ? 'Deleting...' : 'Delete Field'}
                </button>
              </div>
            </div>
          );
        })}

        <h3 style={{ marginTop: 24 }}>PDF Preview</h3>
        <div className="row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="card" style={{ background: '#f9fbff' }}>
            <h4>Source PDF</h4>
            {sourcePreviewUrl ? (
              <iframe src={sourcePreviewUrl} title="Source PDF Preview" style={{ width: '100%', height: 480, border: '1px solid #cfe0ff' }} />
            ) : (
              <p>Click “Preview Source” to view.</p>
            )}
          </div>
          <div className="card" style={{ background: '#f9fbff' }}>
            <h4>AcroForm PDF</h4>
            {acroPreviewUrl ? (
              <iframe src={acroPreviewUrl} title="AcroForm PDF Preview" style={{ width: '100%', height: 480, border: '1px solid #cfe0ff' }} />
            ) : (
              <p>Generate and preview AcroForm to inspect field placement.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
