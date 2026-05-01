import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type AssignmentInfo = {
  patient_first_name: string;
  template_name: string;
  expires_at: string;
  status: string;
};

export function AssignmentVerifyPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [info, setInfo] = useState<AssignmentInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    if (!token) return;
    api<AssignmentInfo>(`/api/assignments/${token}`)
      .then(setInfo)
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError('');
    setVerifying(true);

    try {
      const result = await api<{ session_id: string; practice_slug: string; template_id: string }>(
        `/api/assignments/${token}/verify`,
        {
          method: 'POST',
          body: JSON.stringify({ first_name: firstName, last_name: lastName, dob }),
        },
      );
      navigate(`/p/${result.practice_slug}/session/${result.session_id}/pdf-form`);
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
    const isCompleted = loadError.toLowerCase().includes('submitted') || loadError.toLowerCase().includes('completed');
    return (
      <div className="container">
        <div className="card">
          <h2>{isExpired ? 'Link Expired' : isCompleted ? 'Form Already Submitted' : 'Link Not Found'}</h2>
          <p style={{ color: '#666' }}>
            {isExpired
              ? 'This form link has expired. Please contact your healthcare provider for a new link.'
              : isCompleted
                ? 'This form has already been completed. Thank you!'
                : 'This form link is invalid. Please check the URL or contact your healthcare provider.'}
          </p>
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
            Hi <strong>{info.patient_first_name}</strong>, you have been sent a form to complete:{' '}
            <strong>{info.template_name}</strong>. Please confirm your identity to continue.
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
            {verifying ? 'Verifying...' : 'Continue to Form'}
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
