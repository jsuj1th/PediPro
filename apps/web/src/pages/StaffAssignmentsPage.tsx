import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, authHeader } from '../lib/api';

type Props = {
  token: string | null;
};

type PublishedTemplate = {
  id: string;
  name: string;
  template_key: string;
};

type AssignmentRecord = {
  id: string;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
  child_first_name: string;
  child_last_name: string;
  child_dob: string;
  template_name: string;
  assigned_by_email: string;
  submission_id: string | null;
};

type BundleResult = {
  bundle_id: string | null;
  bundle_token: string;
  patient_name: string;
  template_names: string[];
  fill_url: string;
  qr_code_data_url: string;
  expires_at: string;
};

export function StaffAssignmentsPage({ token }: Props) {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  const [createdBundle, setCreatedBundle] = useState<BundleResult | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [showQrId, setShowQrId] = useState<string | null>(null);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState('');

  async function loadTemplates() {
    if (!token) return;
    try {
      const result = await api<any[]>('/api/staff/templates', { headers: authHeader(token) });
      setTemplates(
        result
          .filter((t: any) => t.status === 'published')
          .map((t: any) => ({ id: t.id, name: t.name, template_key: t.template_key })),
      );
    } catch {
      // non-fatal
    }
  }

  async function loadAssignments() {
    if (!token) return;
    try {
      const result = await api<AssignmentRecord[]>('/api/staff/assignments', { headers: authHeader(token) });
      setAssignments(result);
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    if (!token) {
      navigate('/staff/login');
      return;
    }
    loadTemplates();
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  async function handleCreate() {
    if (!token || !firstName.trim() || !lastName.trim() || !dob || selectedTemplateIds.length === 0) return;
    setSubmitting(true);
    setError('');
    setSmsResult('');
    try {
      const days = expiresInDays >= 1 ? expiresInDays : 7;
      const result = await api<BundleResult>('/api/staff/assignments', {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          template_ids: selectedTemplateIds,
          expires_in_days: days,
        }),
      });
      setCreatedBundle(result);
      setShowForm(false);
      setShowQrId(null);
      setFirstName('');
      setLastName('');
      setDob('');
      setSelectedTemplateIds([]);
      setExpiresInDays(7);
      await loadAssignments();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteAssignment(id: string) {
    if (!token) return;
    if (!window.confirm('Delete this assignment? This cannot be undone.')) return;
    try {
      await api(`/api/staff/assignments/${id}`, { method: 'DELETE', headers: authHeader(token) });
      await loadAssignments();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSendSms() {
    if (!token || !smsPhone || !createdBundle?.bundle_id) return;
    setSmsSending(true);
    setSmsResult('');
    try {
      await api(`/api/staff/assignments/bundle/${createdBundle.bundle_id}/send-sms`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ phone: smsPhone }),
      });
      setSmsResult('SMS sent.');
    } catch (e) {
      setSmsResult(`Failed: ${(e as Error).message}`);
    } finally {
      setSmsSending(false);
    }
  }

  function copyLink(id: string, url: string) {
    const onSuccess = () => {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(onSuccess).catch(() => fallbackCopy(url, onSuccess));
    } else {
      fallbackCopy(url, onSuccess);
    }
  }

  function fallbackCopy(url: string, onSuccess: () => void) {
    const el = document.createElement('textarea');
    el.value = url;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    if (document.execCommand('copy')) onSuccess();
    document.body.removeChild(el);
  }

  async function viewLink(a: AssignmentRecord) {
    if (!token) return;
    try {
      const result = await api<{ fill_url: string; qr_code_data_url: string; bundle_id: string | null }>(
        `/api/staff/assignments/${a.id}/link`,
        { headers: authHeader(token) },
      );
      setCreatedBundle({
        bundle_id: result.bundle_id,
        bundle_token: '',
        patient_name: `${a.child_first_name} ${a.child_last_name}`,
        template_names: [a.template_name],
        fill_url: result.fill_url,
        qr_code_data_url: result.qr_code_data_url,
        expires_at: a.expires_at,
      });
      setShowQrId(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const statusStyle = (status: string) => ({
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    background: status === 'completed' ? '#d4edda' : status === 'expired' ? '#f8d7da' : status === 'in_progress' ? '#fff3cd' : '#cfe2ff',
    color: status === 'completed' ? '#155724' : status === 'expired' ? '#721c24' : status === 'in_progress' ? '#856404' : '#084298',
  });

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Form Assignments</h2>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setCreatedBundle(null);
              setError('');
            }}
          >
            {showForm ? 'Cancel' : '+ New Assignment'}
          </button>
        </div>

        {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}

        {showForm && (
          <div className="card" style={{ background: '#f0f7ff', marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Create Assignment</h3>
            <div className="row">
              <div className="field">
                <label>First Name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
              </div>
              <div className="field">
                <label>Date of Birth</label>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div className="field">
                <label>Expires After (days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
                Forms to Assign
                {selectedTemplateIds.length > 0 && (
                  <span style={{ fontWeight: 400, color: '#555', marginLeft: 8 }}>
                    ({selectedTemplateIds.length} selected)
                  </span>
                )}
              </label>
              {templates.length === 0 ? (
                <p style={{ fontSize: 13, color: '#888' }}>No published templates available.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {templates.map((t) => (
                    <label
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: selectedTemplateIds.includes(t.id) ? '#dbeafe' : '#fff',
                        border: `1px solid ${selectedTemplateIds.includes(t.id) ? '#3b82f6' : '#ddd'}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTemplateIds.includes(t.id)}
                        onChange={() => toggleTemplate(t.id)}
                        style={{ width: 16, height: 16 }}
                      />
                      <span>{t.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={submitting || !firstName.trim() || !lastName.trim() || !dob || selectedTemplateIds.length === 0}
            >
              {submitting
                ? 'Creating...'
                : `Create ${selectedTemplateIds.length > 1 ? `${selectedTemplateIds.length} Assignment Links` : 'Assignment Link'}`}
            </button>
            <p style={{ fontSize: 12, color: '#666', marginTop: 8, marginBottom: 0 }}>
              If no patient record exists for this name + DOB, one will be created automatically.
            </p>
          </div>
        )}

        {createdBundle && (
          <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #b3d4f7' }}>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>
              Bundle Created for <em>{createdBundle.patient_name}</em>
            </h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
              Forms: {createdBundle.template_names.join(', ')}
            </p>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Expires: {new Date(createdBundle.expires_at).toLocaleDateString()}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button onClick={() => copyLink('bundle', createdBundle.fill_url)}>
                {copiedLinkId === 'bundle' ? 'Copied!' : 'Copy Link'}
              </button>
              <button className="secondary" onClick={() => setShowQrId(showQrId === 'bundle' ? null : 'bundle')}>
                {showQrId === 'bundle' ? 'Hide QR' : 'Show QR'}
              </button>
            </div>
            {showQrId === 'bundle' && (
              <img
                src={createdBundle.qr_code_data_url}
                alt="QR code"
                style={{ marginBottom: 12, border: '1px solid #ddd', borderRadius: 4, display: 'block' }}
              />
            )}
            {createdBundle.bundle_id && (
              <div style={{ padding: 12, background: '#f8faff', borderRadius: 8, border: '1px solid #dde' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Send via SMS</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="tel"
                    placeholder="+15551234567"
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    style={{ width: 180 }}
                  />
                  <button onClick={handleSendSms} disabled={smsSending || !smsPhone}>
                    {smsSending ? 'Sending...' : 'Send SMS'}
                  </button>
                </div>
                {smsResult && (
                  <p style={{ marginTop: 6, fontSize: 13, color: smsResult.startsWith('Failed') ? '#c00' : '#0a0' }}>
                    {smsResult}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {assignments.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>All Assignments</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>DOB</th>
                  <th>Form</th>
                  <th>Status</th>
                  <th>Assigned By</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.child_first_name} {a.child_last_name}</td>
                    <td>{a.child_dob}</td>
                    <td>{a.template_name}</td>
                    <td><span style={statusStyle(a.status)}>{a.status}</span></td>
                    <td>{a.assigned_by_email}</td>
                    <td>{new Date(a.expires_at).toLocaleDateString()}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(a.status === 'pending' || a.status === 'in_progress') && (
                        <button
                          className="secondary"
                          style={{ fontSize: 12, padding: '2px 8px' }}
                          onClick={() => viewLink(a)}
                        >
                          View Link
                        </button>
                      )}
                      <button
                        className="secondary"
                        style={{ fontSize: 12, padding: '2px 8px', color: '#c00', borderColor: '#c00' }}
                        onClick={() => handleDeleteAssignment(a.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {assignments.length === 0 && !showForm && (
          <p style={{ marginTop: 24, color: '#666' }}>No assignments yet. Click "+ New Assignment" to get started.</p>
        )}
      </div>
    </div>
  );
}
