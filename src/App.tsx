import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AdminLayout } from './admin/AdminLayout';
import { AdminLogin } from './admin/AdminLogin';
import { Onboarding } from './admin/Onboarding';
import { TodayBoard } from './admin/TodayBoard';
import { TasksPage } from './admin/TasksPage';
import { TaskEditor } from './admin/TaskEditor';
import { TaskDetail } from './admin/TaskDetail';
import { OccurrenceDetail } from './admin/OccurrenceDetail';
import { ReviewQueue } from './admin/ReviewQueue';
import { PeoplePage } from './admin/PeoplePage';
import { WorkerProfile } from './admin/WorkerProfile';
import { AnalyticsPage } from './admin/AnalyticsPage';
import { SettingsPage } from './admin/SettingsPage';
import { WorkerHome } from './worker/WorkerHome';
import { WorkerLink } from './worker/WorkerLink';
import { Loading } from './components/ui';
import { configured } from './lib/supabase';

export function App() {
  if (!configured) {
    return (
      <div className="center-page">
        <div className="card auth-card stack">
          <h1>Setup needed</h1>
          <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then rebuild. See DEPLOY.md.</p>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminGuard />}>
        <Route index element={<TodayBoard />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/new" element={<TaskEditor />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="tasks/:id/edit" element={<TaskEditor />} />
        <Route path="occurrences/:id" element={<OccurrenceDetail />} />
        <Route path="review" element={<ReviewQueue />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/:id" element={<WorkerProfile />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/w/link" element={<WorkerLink />} />
      <Route path="/w" element={<WorkerGuard />} />
      <Route path="/w/task/:id" element={<WorkerGuard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Home() {
  const { loading, member } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={member?.role === 'worker' ? '/w' : '/admin'} replace />;
}

function AdminGuard() {
  const { loading, session, member, household } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/admin/login" replace />;
  if (!member || !household) return <Onboarding />;
  if (member.role === 'worker') return <Navigate to="/w" replace />;
  return <AdminLayout />;
}

function WorkerGuard() {
  const { loading, member, household } = useAuth();
  if (loading) return <Loading />;
  if (!member || !household) return <WorkerSignedOut />;
  if (member.role !== 'worker') return <Navigate to="/admin" replace />;
  return <WorkerHome />;
}

function WorkerSignedOut() {
  return (
    <div className="center-page">
      <div className="stack" style={{ textAlign: 'center', fontSize: 64 }}>
        <span aria-hidden="true">📷 ➜ 🔳</span>
        <p style={{ fontSize: 18 }}>Scan your QR code to sign in.</p>
      </div>
    </div>
  );
}
