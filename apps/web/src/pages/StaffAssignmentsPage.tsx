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

type CreatedAssignment = {
  id: string;
  token: string;
  fill_url: string;
  qr_code_data_url: string;
  patient_name: string;
  template_name: string;
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
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  const [createdAssignment, setCreatedAssignment] = useState<CreatedAssignment | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQr, setShowQr] = useState(false);
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

  async function handleCreate() {
    if (!token || !firstName.trim() || !lastName.trim() || !dob || !selectedTemplateId) return;
    setSubmitting(true);
    setError('');
    setSmsResult('');
    try {
      const result = await api<CreatedAssignment>('/api/staff/assignments', {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          template_id: selectedTemplateId,
          expires_in_days: expiresInDays >= 1 ? expiresInDays : 7,
        }),
      });
      setCreatedAssignment(result);
      setShowForm(false);
      setShowQr(false);
      setFirstName('');
      setLastName('');
      setDob('');
      setSelectedTemplateId('');
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
      if (createdAssignment?.id === id) setCreatedAssignment(null);
      await loadAssignments();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSendSms(assignmentId: string) {
    if (!token || !smsPhone) return;
    setSmsSending(true);
    setSmsResult('');
    try {
      await api(`/api/staff/assignments/${assignmentId}/send-sms`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ phone: smsPhone }),
      });
      setSmsResult('SMS sent successfully.');
    } catch (e) {
      setSmsResult(`Failed: ${(e as Error).message}`);
    } finally {
      setSmsSending(false);
    }
  }

  function copyLink(url: string) {
    const onSuccess = () => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
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
      const result = await api<{ fill_url: string; qr_code_data_url: string }>(
        `/api/staff/assignments/${a.id}/link`,
        { headers: authHeader(token) },
      );
      setCreatedAssignment({
        id: a.id,
        token: a.token,
        fill_url: result.fill_url,
        qr_code_data_url: result.qr_code_data_url,
        patient_name: `${a.child_first_name} ${a.child_last_name}`,
        template_name: a.template_name,
        expires_at: a.expires_at,
      });
      setShowQr(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Form Assignments</h2>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setCreatedAssignment(null);
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
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
              <div className="field">
                <label>Date of Birth</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Form Template</label>
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                  <option value="">-- Select a published template --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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
            <button
              onClick={handleCreate}
              disabled={submitting || !firstName.trim() || !lastName.trim() || !dob || !selectedTemplateId}
            >
              {submitting ? 'Creating...' : 'Create Assignment Link'}
            </button>
            <p style={{ fontSize: 12, color: '#666', marginTop: 8, marginBottom: 0 }}>
              If no patient record exists for this name + DOB, one will be created automatically.
            </p>
          </div>
        )}

        {createdAssignment && (
          <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #b3d4f7' }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>
              Assignment created for <em>{createdAssignment.patient_name}</em>
            </p>
            <p style={{ marginBottom: 12, color: '#555', fontSize: 14 }}>
              Form: {createdAssignment.template_name} &nbsp;·&nbsp; Expires:{' '}
              {new Date(createdAssignment.expires_at).toLocaleDateString()}
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button onClick={() => copyLink(createdAssignment.fill_url)}>
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </button>
              <button className="secondary" onClick={() => setShowQr((v) => !v)}>
                {showQr ? 'Hide QR Code' : 'Show QR Code'}
              </button>
            </div>

            {showQr && (
              <div style={{ marginBottom: 16 }}>
                <img
                  src={createdAssignment.qr_code_data_url}
                  alt="QR code for form link"
                  style={{ border: '1px solid #ddd', borderRadius: 4, display: 'block' }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Send via SMS</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="tel"
                  placeholder="+15551234567"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                  style={{ width: 180 }}
                />
                <button onClick={() => handleSendSms(createdAssignment.id)} disabled={smsSending || !smsPhone}>
                  {smsSending ? 'Sending...' : 'Send SMS'}
                </button>
              </div>
              {smsResult && (
                <p style={{ marginTop: 6, fontSize: 13, color: smsResult.startsWith('Failed') ? '#c00' : '#0a0' }}>
                  {smsResult}
                </p>
              )}
            </div>
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
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        background:
                          a.status === 'completed' ? '#d4edda'
                          : a.status === 'expired' ? '#f8d7da'
                          : a.status === 'in_progress' ? '#fff3cd'
                          : '#cfe2ff',
                        color:
                          a.status === 'completed' ? '#155724'
                          : a.status === 'expired' ? '#721c24'
                          : a.status === 'in_progress' ? '#856404'
                          : '#084298',
                      }}>
                        {a.status}
                      </span>
                    </td>
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
