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
        Form: <span className="badge">{template?.title ?? '...'}</span>
      </p>
      <p>Estimated time: 8-10 minutes</p>
      <p>Steps: {template?.steps.length ?? '...'}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {template?.acroform_ready ? (
          <Link to={`/p/${slug}/session/${sessionId}/pdf-form`}>
            <button style={{ width: '100%' }}>Fill PDF Directly</button>
          </Link>
        ) : null}
        <Link to={`/p/${slug}/session/${sessionId}/form/${template?.form_id ?? 'patient_registration'}/step/1`}>
          <button style={{ width: '100%', background: template?.acroform_ready ? '#6b7280' : undefined }}>
            {template?.acroform_ready ? 'Fill Step-by-Step Instead' : 'Start Paperwork'}
          </button>
        </Link>
      </div>
    </div>
  );
}
