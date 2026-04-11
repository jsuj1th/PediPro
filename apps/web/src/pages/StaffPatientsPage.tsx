import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, authHeader } from '../lib/api';

type Props = {
  token: string | null;
};

export function StaffPatientsPage({ token }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/staff/login');
      return;
    }

    api<any[]>(`/api/staff/patients?search=${encodeURIComponent(search)}`, {
      headers: authHeader(token),
    })
      .then(setPatients)
      .catch((e) => setError((e as Error).message));
  }, [token, search, navigate]);

  return (
    <div className="container">
      <div className="card">
        <h2>Staff Patient Workspace</h2>
        <p>
          Need to manage form templates? <Link to="/staff/templates">Open Template Builder</Link>
        </p>
        <div className="row">
          <div className="field">
            <label>Search by Name</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <table className="table">
          <thead>
            <tr>
              <th>Child Name</th>
              <th>DOB</th>
              <th>Visit Type</th>
              <th>Status</th>
              <th>Account</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id}>
                <td>
                  {patient.child_first_name} {patient.child_last_name}
                </td>
                <td>{patient.child_dob}</td>
                <td>{patient.visit_type}</td>
                <td>{patient.latest_submission_status ?? 'n/a'}</td>
                <td>{patient.account_email ?? 'Not linked'}</td>
                <td>
                  <Link to={`/staff/patients/${patient.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
