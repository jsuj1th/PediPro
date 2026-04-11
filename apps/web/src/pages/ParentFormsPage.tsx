import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, authHeader } from '../lib/api';

type Props = {
  token: string | null;
};

type ParentFormCard = {
  id: string;
  template_key: string;
  title: string;
  description: string;
  version: number;
  visit_type: string;
  start_path: string;
  acroform_ready: boolean;
};

type ParentFormsResponse = {
  practice_slug: string;
  forms: ParentFormCard[];
};

export function ParentFormsPage({ token }: Props) {
  const navigate = useNavigate();
  const [forms, setForms] = useState<ParentFormCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/parent/login');
      return;
    }

    setLoading(true);
    setError('');
    api<ParentFormsResponse>('/api/parent/forms', {
      headers: authHeader(token),
    })
      .then((response) => setForms(response.forms ?? []))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, navigate]);

  if (!token) {
    return null;
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Parent Forms</h2>
        <p>Select a published form to begin intake.</p>
        {error ? <div className="error">{error}</div> : null}
        {loading ? <p>Loading forms...</p> : null}
        {!loading && forms.length === 0 ? <p>No forms are currently available for your practice.</p> : null}

        <div className="row" style={{ marginTop: 12 }}>
          {forms.map((form) => (
            <div key={form.id} className="card" style={{ background: '#f8fbff' }}>
              <h3 style={{ marginBottom: 8 }}>{form.title}</h3>
              <p style={{ minHeight: 48 }}>{form.description}</p>
              <div style={{ fontSize: 12, marginBottom: 10 }}>
                <strong>Template:</strong> {form.template_key} v{form.version}
              </div>
              <Link to={form.start_path}>
                <button>{form.acroform_ready ? 'Start Form' : 'Start Form (No AcroForm PDF yet)'}</button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
