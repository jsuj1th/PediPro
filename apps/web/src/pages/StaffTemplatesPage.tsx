import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, authHeader } from '../lib/api';

type Props = {
  token: string | null;
};

type TemplateRow = {
  id: string;
  template_key: string;
  version: number;
  name: string;
  status: 'draft' | 'published' | 'archived';
  acroform_pdf_path: string | null;
  created_at: string;
};

export function StaffTemplatesPage({ token }: Props) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const [templateKey, setTemplateKey] = useState('patient_registration');
  const [templateName, setTemplateName] = useState('Patient Registration');
  const [file, setFile] = useState<File | null>(null);

  async function loadTemplates() {
    if (!token) return;
    setLoading(true);
    try {
      const rows = await api<TemplateRow[]>('/api/staff/templates', {
        headers: authHeader(token),
      });
      setTemplates(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      navigate('/staff/login');
      return;
    }
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function uploadTemplate() {
    setError('');
    if (!token) return;
    if (!templateKey.trim() || !templateName.trim() || !file) {
      setError('Template key, name, and PDF file are required.');
      return;
    }

    const body = new FormData();
    body.append('template_key', templateKey.trim());
    body.append('name', templateName.trim());
    body.append('file', file);

    setUploading(true);
    try {
      const created = await api<{ id: string }>('/api/staff/templates/upload-source', {
        method: 'POST',
        headers: authHeader(token),
        body,
      });

      setFile(null);
      await loadTemplates();
      navigate(`/staff/templates/${created.id}/editor`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteVersion(template: TemplateRow) {
    if (!token) return;
    setError('');

    const confirmed = window.confirm(
      `Delete ${template.template_key} v${template.version}? This cannot be undone and removes its field definitions and generated PDF files.`,
    );
    if (!confirmed) return;

    setDeletingId(template.id);
    try {
      await api(`/api/staff/templates/${template.id}`, {
        method: 'DELETE',
        headers: authHeader(token),
      });
      await loadTemplates();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId('');
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Template Builder</h2>
        <p>Upload a source PDF, define fields, generate AcroForm, and publish for patient intake.</p>

        {error ? <div className="error">{error}</div> : null}

        <h3>Create New Template Version</h3>
        <div className="row">
          <div className="field">
            <label>Template Key</label>
            <input
              value={templateKey}
              onChange={(event) => setTemplateKey(event.target.value)}
              placeholder="patient_registration"
            />
          </div>
          <div className="field">
            <label>Template Name</label>
            <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Patient Registration" />
          </div>
          <div className="field">
            <label>Source PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <button onClick={uploadTemplate} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload and Open Editor'}
        </button>

        <h3 style={{ marginTop: 24 }}>Existing Templates</h3>
        {loading ? <p>Loading templates...</p> : null}
        {!loading && templates.length === 0 ? <p>No templates yet.</p> : null}

        {templates.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Version</th>
                <th>Status</th>
                <th>AcroForm</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>
                    <strong>{template.name}</strong>
                    <div style={{ fontSize: 12 }}>{template.template_key}</div>
                  </td>
                  <td>v{template.version}</td>
                  <td>
                    <span className="badge">{template.status}</span>
                  </td>
                  <td>{template.acroform_pdf_path ? 'Generated' : 'Not generated'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <Link to={`/staff/templates/${template.id}/editor`}>Open Editor</Link>
                      {template.status !== 'published' ? (
                        <button
                          className="secondary"
                          style={{ width: 'auto', minHeight: 34, padding: '6px 10px' }}
                          onClick={() => deleteVersion(template)}
                          disabled={deletingId === template.id}
                        >
                          {deletingId === template.id ? 'Deleting...' : 'Delete Version'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: '#5b6f8c' }}>Active version</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
