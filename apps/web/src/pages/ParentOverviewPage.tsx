import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { FormTemplate } from '../lib/types';

export function ParentOverviewPage() {
  const { slug = 'sunshine-pediatrics', sessionId = '' } = useParams();
  const [template, setTemplate] = useState<FormTemplate | null>(null);

  useEffect(() => {
    api<FormTemplate>(`/api/submissions/${sessionId}/template`).then(setTemplate).catch(() => setTemplate(null));
  }, [sessionId]);

  return (
    <div className="card mobile">
      <h2>What to Expect</h2>
      <p>
        Form: <span className="badge">New Patient Paperwork</span>
      </p>
      <p>Estimated time: 8-10 minutes</p>
      <p>Steps: {template?.steps.length ?? '...'}</p>
      <Link to={`/p/${slug}/session/${sessionId}/form/${template?.form_id ?? 'patient_registration'}/step/1`}>
        <button>Start Paperwork</button>
      </Link>
    </div>
  );
}
