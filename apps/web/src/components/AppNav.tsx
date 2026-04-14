import { Link } from 'react-router-dom';

type Props = {
  staffToken?: string | null;
  parentToken?: string | null;
  onLogout?: () => void;
  appMode?: string;
};

export function AppNav({ staffToken, parentToken, onLogout, appMode }: Props) {
  const isAdminOnly = appMode === 'admin';
  const isPatientOnly = appMode === 'patient';

  const modeBadge = isAdminOnly
    ? <span style={{ fontSize: '0.7rem', background: '#e67e22', color: '#fff', borderRadius: 4, padding: '1px 6px', marginLeft: 8, verticalAlign: 'middle' }}>ADMIN</span>
    : isPatientOnly
      ? <span style={{ fontSize: '0.7rem', background: '#27ae60', color: '#fff', borderRadius: 4, padding: '1px 6px', marginLeft: 8, verticalAlign: 'middle' }}>PATIENT</span>
      : null;

  return (
    <div className="nav">
      <div className="container">
        <Link to="/" style={{ color: '#fff', textDecoration: 'none' }}>
          <strong>PediForm Pro</strong>{modeBadge}
        </Link>
        <div>
          {staffToken && !isPatientOnly ? (
            <>
              <Link to="/staff/patients">Patients</Link>
              <Link to="/staff/submissions">Submissions</Link>
              <Link to="/staff/templates">Templates</Link>
              <a href="#logout" onClick={(e) => { e.preventDefault(); onLogout?.(); }}>Logout</a>
            </>
          ) : parentToken && !isAdminOnly ? (
            <>
              <Link to="/parent/dashboard">My Dashboard</Link>
              <Link to="/parent/forms">Forms</Link>
              <a href="#logout" onClick={(e) => { e.preventDefault(); onLogout?.(); }}>Logout</a>
            </>
          ) : (
            <>
              {!isAdminOnly && <Link to="/parent/login">Parent Login</Link>}
              {!isPatientOnly && <Link to="/staff/login">Admin Login</Link>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
