import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Props = {
  onAuthenticated: (token: string) => void;
};

export function ParentCreateAccountPage({ onAuthenticated }: Props) {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [accountExists, setAccountExists] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    setAccountExists(false);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await api<{ token: string }>('/api/parent/accounts', {
        method: 'POST',
        body: JSON.stringify({
          submission_id: sessionId,
          email,
          password,
        }),
      });

      onAuthenticated(result.token);
      navigate('/parent/dashboard');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (message.toLowerCase().includes('account already exists')) {
        setAccountExists(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mobile">
      <h2>Create Parent Account</h2>
      <p>Use your Gmail and password for future access.</p>
      <div className="field">
        <label>Gmail Address</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@gmail.com" />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label>Confirm Password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error ? <div className="error">{error}</div> : null}
      <button onClick={submit} disabled={loading}>
        {loading ? 'Creating...' : 'Create Account'}
      </button>
      {accountExists ? (
        <button className="secondary" style={{ marginTop: 10 }} onClick={() => navigate(`/parent/login?email=${encodeURIComponent(email)}`)}>
          Go to Parent Login
        </button>
      ) : null}
      <p style={{ marginTop: 12 }}>
        Already have an account? <Link to="/parent/login">Login here</Link>
      </p>
    </div>
  );
}
