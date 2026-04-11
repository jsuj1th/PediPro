import { Navigate, Route, Routes } from 'react-router-dom';
import { AppNav } from './components/AppNav';
import { getLocal, removeLocal, setLocal } from './lib/storage';
import { HomePage } from './pages/HomePage';
import { ParentConfirmationPage } from './pages/ParentConfirmationPage';
import { ParentCreateAccountPage } from './pages/ParentCreateAccountPage';
import { ParentDashboardPage } from './pages/ParentDashboardPage';
import { ParentFormPage } from './pages/ParentFormPage';
import { ParentFormsPage } from './pages/ParentFormsPage';
import { ParentLoginPage } from './pages/ParentLoginPage';
import { ParentOverviewPage } from './pages/ParentOverviewPage';
import { ParentStartPage } from './pages/ParentStartPage';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { StaffPatientDetailPage } from './pages/StaffPatientDetailPage';
import { StaffPatientsPage } from './pages/StaffPatientsPage';
import { StaffTemplateEditorPage } from './pages/StaffTemplateEditorPage';
import { StaffTemplatesPage } from './pages/StaffTemplatesPage';
import { useState } from 'react';

export function App() {
  const [parentToken, setParentToken] = useState<string | null>(() => getLocal('pediform_parent_token', null));
  const [staffToken, setStaffToken] = useState<string | null>(() => getLocal('pediform_staff_token', null));

  function onParentAuth(token: string) {
    setParentToken(token);
    setLocal('pediform_parent_token', token);
  }

  function onStaffAuth(token: string) {
    setStaffToken(token);
    setLocal('pediform_staff_token', token);
  }

  function logout() {
    setParentToken(null);
    setStaffToken(null);
    removeLocal('pediform_parent_token');
    removeLocal('pediform_staff_token');
  }

  return (
    <>
      <AppNav parentToken={parentToken} staffToken={staffToken} onLogout={logout} />
      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route path="/p/:slug" element={<ParentStartPage />} />
        <Route path="/p/:slug/session/:sessionId/overview" element={<ParentOverviewPage />} />
        <Route path="/p/:slug/session/:sessionId/form/:formId/step/:step" element={<ParentFormPage />} />
        <Route path="/p/:slug/session/:sessionId/confirmation" element={<ParentConfirmationPage />} />
        <Route
          path="/p/:slug/session/:sessionId/create-account"
          element={<ParentCreateAccountPage onAuthenticated={onParentAuth} />}
        />

        <Route path="/parent/login" element={<ParentLoginPage onAuthenticated={onParentAuth} />} />
        <Route path="/parent/forms" element={<ParentFormsPage token={parentToken} />} />
        <Route path="/parent/dashboard" element={<ParentDashboardPage token={parentToken} />} />

        <Route path="/staff/login" element={<StaffLoginPage onAuthenticated={onStaffAuth} />} />
        <Route path="/staff/patients" element={<StaffPatientsPage token={staffToken} />} />
        <Route path="/staff/patients/:id" element={<StaffPatientDetailPage token={staffToken} />} />
        <Route path="/staff/templates" element={<StaffTemplatesPage token={staffToken} />} />
        <Route path="/staff/templates/:id/editor" element={<StaffTemplateEditorPage token={staffToken} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
