import { Link, useParams } from 'react-router-dom';
import { getLocal } from '../lib/storage';

export function ParentConfirmationPage() {
  const { slug = 'sunshine-pediatrics', sessionId = '' } = useParams();
  const start = getLocal<Record<string, any>>(`pediform_start_${sessionId}`, {});

  return (
    <div className="card mobile">
      <h2>Paperwork Submitted</h2>
      <p>Thank you! Your paperwork is complete.</p>
      <p>
        Confirmation Code: <strong>{start.confirmation_code ?? 'N/A'}</strong>
      </p>
      <Link to={`/p/${slug}/session/${sessionId}/create-account`}>
        <button>Create Your Account</button>
      </Link>
    </div>
  );
}
