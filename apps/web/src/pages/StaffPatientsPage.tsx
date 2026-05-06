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
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState('');

  function loadPatients() {
    if (!token) return;
    api<any[]>(`/api/staff/patients?search=${encodeURIComponent(search)}`, {
      headers: authHeader(token),
    })
      .then(setPatients)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(() => {
    if (!token) {
      navigate('/staff/login');
      return;
    }
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, navigate]);

  async function handleMergeDuplicates() {
    if (!token) return;
    setMerging(true);
    setMergeResult('');
    try {
      const result = await api<{ removed: number }>('/api/staff/patients/merge-duplicates', {
        method: 'POST',
        headers: authHeader(token),
      });
      setMergeResult(
        result.removed === 0
          ? 'No duplicates found.'
          : `Merged ${result.removed} duplicate record${result.removed !== 1 ? 's' : ''}.`,
      );
      loadPatients();
    } catch (e) {
      setMergeResult(`Failed: ${(e as Error).message}`);
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Staff Patient Workspace</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {mergeResult && (
              <span style={{ fontSize: 13, color: mergeResult.startsWith('Failed') ? '#c00' : '#0a0' }}>
                {mergeResult}
              </span>
            )}
            <button className="secondary" onClick={handleMergeDuplicates} disabled={merging}>
              {merging ? 'Merging...' : 'Merge Duplicates'}
            </button>
          </div>
        </div>

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
