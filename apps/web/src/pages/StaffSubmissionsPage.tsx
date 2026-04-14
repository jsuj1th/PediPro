import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, authHeader } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type Props = {
  token: string | null;
};

type Submission = {
  id: string;
  status: string;
  submitted_at: string | null;
  updated_at: string;
  confirmation_code: string;
  child_first_name: string | null;
  child_last_name: string | null;
  child_dob: string | null;
  patient_id: string | null;
};

export function StaffSubmissionsPage({ token }: Props) {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      navigate('/staff/login');
      return;
    }
    api<Submission[]>('/api/staff/submissions', { headers: authHeader(token) })
      .then(setSubmissions)
      .catch((e) => setError((e as Error).message));
  }, [token, navigate]);

  async function fetchSubmissionPdfBlob(submissionId: string, fallbackMessage: string) {
    const response = await fetch(`${API_BASE}/api/staff/submissions/${submissionId}/pdf`, {
      headers: authHeader(token!),
    });

    if (!response.ok) {
      let message = fallbackMessage;
      try {
        const payload = await response.json();
        message = payload?.error?.message ?? message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    return response.blob();
  }

  async function downloadPdf(submissionId: string, childName: string) {
    if (!token) return;
    setDownloadingId(submissionId);
    setError('');
    try {
      const blob = await fetchSubmissionPdfBlob(submissionId, 'Failed to download PDF');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${childName.replace(/\s+/g, '_') || 'patient'}_form.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function viewPdf(submissionId: string) {
    if (!token) return;

    const previewWindow = window.open('', '_blank');
    setViewingId(submissionId);
    setError('');

    try {
      if (previewWindow) {
        previewWindow.document.title = 'Loading PDF...';
        previewWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 16px;">Loading PDF preview...</p>';
        previewWindow.opener = null;
      }

      const blob = await fetchSubmissionPdfBlob(submissionId, 'Failed to open PDF');
      const url = URL.createObjectURL(blob);

      if (previewWindow) {
        previewWindow.location.replace(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      previewWindow?.close();
      setError((e as Error).message);
    } finally {
      setViewingId(null);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h2>All Submissions</h2>
        <p>Every form submitted by parents. Download the filled PDF or view the full patient record.</p>
        {error ? <div className="error">{error}</div> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>DOB</th>
              <th>Status</th>
              <th>Confirmation</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => {
              const childName = `${s.child_first_name ?? ''} ${s.child_last_name ?? ''}`.trim();
              const isCompleted = s.status === 'completed' || s.status === 'exported';
              return (
                <tr key={s.id}>
                  <td>{childName || <em style={{ color: '#9ca3af' }}>Unknown</em>}</td>
                  <td>{s.child_dob ?? '—'}</td>
                  <td>
                    <span style={{
                      background: s.status === 'completed' ? '#d1fae5' : s.status === 'exported' ? '#dbeafe' : '#fef3c7',
                      color: s.status === 'completed' ? '#065f46' : s.status === 'exported' ? '#1e40af' : '#92400e',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.confirmation_code}</td>
                  <td>{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '—'}</td>
                  <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isCompleted ? (
                      <>
                        <button
                          className="secondary"
                          style={{ padding: '4px 12px', fontSize: 13, width: 'auto', minHeight: 34 }}
                          disabled={viewingId === s.id || downloadingId === s.id}
                          onClick={() => viewPdf(s.id)}
                        >
                          {viewingId === s.id ? 'Opening...' : 'View PDF'}
                        </button>
                        <button
                          style={{ padding: '4px 12px', fontSize: 13, width: 'auto', minHeight: 34 }}
                          disabled={downloadingId === s.id || viewingId === s.id}
                          onClick={() => downloadPdf(s.id, childName)}
                        >
                          {downloadingId === s.id ? 'Downloading...' : 'Download PDF'}
                        </button>
                      </>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>Not submitted</span>
                    )}
                    {s.patient_id ? (
                      <Link to={`/staff/patients/${s.patient_id}`} style={{ fontSize: 13 }}>View Patient</Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {submissions.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280' }}>No submissions yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
