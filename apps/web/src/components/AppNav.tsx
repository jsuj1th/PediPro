import { Link } from 'react-router-dom';

type Props = {
  staffToken?: string | null;
  parentToken?: string | null;
  onLogout?: () => void;
};

export function AppNav({ staffToken, parentToken, onLogout }: Props) {
  return (
    <div className="nav">
      <div className="container">
        <Link to="/" style={{ color: '#fff', textDecoration: 'none' }}>
          <strong>PediForm Pro</strong>
        </Link>
        <div>
          <Link to={parentToken ? '/parent/forms' : '/parent/login'}>
            {parentToken ? 'Parent Forms' : 'Parent Login'}
          </Link>
          {staffToken ? <Link to="/staff/patients">Admin Workspace</Link> : <Link to="/staff/login">Admin Login</Link>}
          {staffToken ? <Link to="/staff/templates">Template Builder</Link> : null}
          {(staffToken || parentToken) && (
            <a
              href="#logout"
              onClick={(event) => {
                event.preventDefault();
                onLogout?.();
              }}
            >
              Logout
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
