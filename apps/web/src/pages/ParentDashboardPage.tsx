import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authHeader, api } from '../lib/api';

type Props = {
  token: string | null;
};

export function ParentDashboardPage({ token }: Props) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/api/parent/me', {
      headers: authHeader(token),
    })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [token]);

  if (!token) {
    return (
      <div className="card mobile">
        <p>Please login to view your dashboard.</p>
        <Link to="/parent/login"><button>Login</button></Link>
      </div>
    );
  }

  return (
    <div className="card mobile">
      <h2>Parent Dashboard</h2>
      {error ? <div className="error">{error}</div> : null}
      {!data ? <p>Loading...</p> : null}
      {data ? (
        <>
          <p>Account: {data.account.email}</p>
          <h3>Linked Children</h3>
          {data.patients.length === 0 ? <p>No linked children yet.</p> : null}
          {data.patients.map((patient: any) => (
            <div key={patient.id} className="card" style={{ marginBottom: 10 }}>
              <strong>
                {patient.child_first_name} {patient.child_last_name}
              </strong>
              <div>DOB: {patient.child_dob}</div>
              <div>Visit Type: {patient.visit_type}</div>
            </div>
          ))}
          <div style={{ marginTop: 16 }}>
            <Link to="/parent/forms"><button className="secondary">Browse Available Forms</button></Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
