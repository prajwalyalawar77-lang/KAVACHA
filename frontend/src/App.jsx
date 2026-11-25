import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import AppLayout from './layouts/AppLayout';
import { PublicOnly, RequireAuth, RequireRole } from './components/RouteGuards';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RoleSelectPage from './pages/RoleSelectPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import DocumentsPage from './pages/DocumentsPage';
import AnalysisPage from './pages/AnalysisPage';
import ComparisonPage from './pages/ComparisonPage';
import SuppliersPage from './pages/SuppliersPage';
import SupplierDetailPage from './pages/SupplierDetailPage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import PublicVerifyPage from './pages/PublicVerifyPage';
import NotFoundPage from './pages/NotFoundPage';

import ForensicViewerPage from './pages/modules/document-forensics/ForensicViewerPage';
import VerificationPage from './pages/modules/smart-verification/VerificationPage';
import FraudIntelligencePage from './pages/modules/fraud-intelligence/FraudIntelligencePage';
import IndustrialPortalPage from './pages/modules/industrial-intelligence/IndustrialPortalPage';
import PublicSafetyPage from './pages/modules/public-safety/PublicSafetyPage';
import RiskAssessmentPage from './pages/modules/risk-assessment/RiskAssessmentPage';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="/verify/:token" element={<PublicVerifyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />
      <Route
        path="/select-role"
        element={
          <RequireAuth>
            <RoleSelectPage />
          </RequireAuth>
        }
      />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="history" element={<DocumentsPage />} />
        <Route path="documents/:documentId" element={<AnalysisPage />} />
        <Route path="documents/:documentId/forensics" element={<ForensicViewerPage />} />
        <Route path="documents/:documentId/verification" element={<VerificationPage />} />
        <Route path="documents/:documentId/risk" element={<RiskAssessmentPage />} />
        <Route path="verify" element={<VerificationPage />} />
        <Route path="compare" element={<ComparisonPage />} />
        <Route path="risk" element={<RiskAssessmentPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="fraud"
          element={
            <RequireRole roles={['admin', 'industrial']}>
              <FraudIntelligencePage />
            </RequireRole>
          }
        />
        <Route path="fraud-intelligence" element={<Navigate to="/app/fraud" replace />} />
        <Route
          path="industrial"
          element={
            <RequireRole roles={['admin', 'industrial']}>
              <IndustrialPortalPage />
            </RequireRole>
          }
        />
        <Route
          path="safety"
          element={
            <RequireRole roles={['admin', 'public']}>
              <PublicSafetyPage />
            </RequireRole>
          }
        />
        <Route path="public-safety" element={<Navigate to="/app/safety" replace />} />
        <Route
          path="suppliers"
          element={
            <RequireRole roles={['admin', 'industrial']}>
              <SuppliersPage />
            </RequireRole>
          }
        />
        <Route
          path="suppliers/:supplierId"
          element={
            <RequireRole roles={['admin', 'industrial']}>
              <SupplierDetailPage />
            </RequireRole>
          }
        />
        <Route
          path="admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminPage />
            </RequireRole>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
