import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { setLocal } from '../lib/storage';

type Practice = {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
};

export function ParentStartPage() {
  const { slug = 'sunshine-pediatrics' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateKey = searchParams.get('template_key')?.trim() || '';

  const requestedVisitType = searchParams.get('visit_type');
  const defaultVisitType =
    requestedVisitType === 'well_child' || requestedVisitType === 'sick' || requestedVisitType === 'follow_up'
      ? requestedVisitType
      : 'new_patient';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    child_first_name: '',
    child_last_name: '',
    child_dob: '',
    visit_type: defaultVisitType,
  });

  async function handleContinue() {
    setError('');
    if (!form.child_first_name || !form.child_last_name || !form.child_dob || !form.visit_type) {
      setError('Please fill all required fields.');
      return;
    }

    setLoading(true);
    try {
      const practice = await api<Practice>(`/api/practices/${slug}`);
      const submission = await api<{ session_id: string; confirmation_code: string; template_version: string }>(
        '/api/submissions',
        {
          method: 'POST',
          body: JSON.stringify({
            practice_id: practice.id,
            template_key: templateKey || undefined,
            ...form,
          }),
        },
      );

      setLocal(`pediform_start_${submission.session_id}`, {
        ...form,
        practice,
        confirmation_code: submission.confirmation_code,
      });

      navigate(`/p/${slug}/session/${submission.session_id}/overview`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mobile">
      <h2>New Patient Registration</h2>
      <p>Practice: {slug}</p>
      <div className="row">
        <div className="field">
          <label>Child First Name *</label>
          <input
            value={form.child_first_name}
            onChange={(e) => setForm((prev) => ({ ...prev, child_first_name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Child Last Name *</label>
          <input value={form.child_last_name} onChange={(e) => setForm((prev) => ({ ...prev, child_last_name: e.target.value }))} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Date of Birth *</label>
          <input type="date" value={form.child_dob} onChange={(e) => setForm((prev) => ({ ...prev, child_dob: e.target.value }))} />
        </div>
        <div className="field">
          <label>Visit Type *</label>
          <select value={form.visit_type} onChange={(e) => setForm((prev) => ({ ...prev, visit_type: e.target.value }))}>
            <option value="new_patient">New Patient</option>
            <option value="well_child">Well Child</option>
            <option value="sick">Sick Visit</option>
            <option value="follow_up">Follow-Up</option>
          </select>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <button onClick={handleContinue} disabled={loading}>
        {loading ? 'Starting...' : 'Continue'}
      </button>
      <p style={{ marginTop: 12 }}>
        Already created an account? <Link to="/parent/login">Parent login</Link>
      </p>
    </div>
  );
}
