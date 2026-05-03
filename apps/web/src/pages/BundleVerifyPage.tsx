import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type BundleInfo = {
  patient_first_name: string;
  forms: Array<{ id: string; template_name: string; status: string }>;
  expires_at: string;
};

type VerifiedAssignment = {
  assignment_id: string;
  template_name: string;
  session_id: string;
  practice_slug: string;
  template_id: string;
  status: string;
};

export function BundleVerifyPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [info, setInfo] = useState<BundleInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [verified, setVerified] = useState<VerifiedAssignment[] | null>(() => {
    if (!token) return null;
    try {
      const cached = sessionStorage.getItem(`bundle_verify_${token}`);
      if (cached) return JSON.parse(cached) as VerifiedAssignment[];
    } catch {
      // ignore
    }
    return null;
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    if (!token) return;
    api<BundleInfo>(`/api/assignments/bundle/${token}`)
      .then(setInfo)
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError('');
    setVerifying(true);
    try {
      const result = await api<{ assignments: VerifiedAssignment[] }>(
        `/api/assignments/bundle/${token}/verify`,
        {
          method: 'POST',
          body: JSON.stringify({ first_name: firstName, last_name: lastName, dob }),
        },
      );
      sessionStorage.setItem(`bundle_verify_${token}`, JSON.stringify(result.assignments));
      setVerified(result.assignments);
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">Loading form details...</div>
      </div>
    );
  }

  if (loadError) {
    const isExpired = loadError.toLowerCase().includes('expired');
    return (
      <div className="container">
        <div className="card">
          <h2>{isExpired ? 'Link Expired' : 'Link Not Found'}</h2>
          <p style={{ color: '#666' }}>
            {isExpired
              ? 'This form link has expired. Please contact your healthcare provider for a new link.'
              : 'This form link is invalid. Please check the URL or contact your healthcare provider.'}
          </p>
        </div>
      </div>
    );
  }

  if (verified) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2>Your Forms</h2>
          {info && (
            <p style={{ color: '#555', marginBottom: 24 }}>
              Hi <strong>{info.patient_first_name}</strong>! Please fill out each form below.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {verified.map((a) => (
              <div
                key={a.assignment_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  background: '#f8faff',
                  borderRadius: 8,
                  border: `1px solid ${a.status === 'completed' ? '#b7ddb7' : '#dde'}`,
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, margin: 0 }}>{a.template_name}</p>
                  {a.status === 'completed' && (
                    <p style={{ fontSize: 12, color: '#0a6', margin: '4px 0 0' }}>Completed</p>
                  )}
                </div>
                {a.status !== 'completed' ? (
                  <button onClick={() => navigate(`/p/${a.practice_slug}/session/${a.session_id}/pdf-form`)}>
                    Fill Form
                  </button>
                ) : (
                  <span style={{ fontSize: 13, color: '#0a6', fontWeight: 600 }}>Done</span>
                )}
              </div>
            ))}
          </div>
          {info?.expires_at && (
            <p style={{ fontSize: 12, color: '#999', marginTop: 16, textAlign: 'center' }}>
              This link expires on {new Date(info.expires_at).toLocaleDateString()}.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <h2>Verify Your Identity</h2>
        {info && (
          <p style={{ color: '#555', marginBottom: 24 }}>
            Hi <strong>{info.patient_first_name}</strong>, you have been sent{' '}
            {info.forms.length === 1 ? 'a form' : `${info.forms.length} forms`} to complete.
            Please confirm your identity to continue.
          </p>
        )}

        <form onSubmit={handleVerify}>
          <div className="row">
            <div className="field">
              <label>First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoFocus
                placeholder="First name"
              />
            </div>
            <div className="field">
              <label>Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="field">
            <label>Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
          </div>

          {verifyError && (
            <div className="error" style={{ marginBottom: 12 }}>
              {verifyError.includes('does not match')
                ? 'The name or date of birth you entered does not match our records. Please try again.'
                : verifyError}
            </div>
          )}

          <button type="submit" className="btn" disabled={verifying} style={{ width: '100%' }}>
            {verifying ? 'Verifying...' : 'Continue'}
          </button>
        </form>

        {info?.expires_at && (
          <p style={{ fontSize: 12, color: '#999', marginTop: 16, textAlign: 'center' }}>
            This link expires on {new Date(info.expires_at).toLocaleDateString()}.
          </p>
        )}
      </div>
    </div>
  );
}
