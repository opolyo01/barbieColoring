import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';

const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const Competitions = lazy(() => import('./pages/Competitions'));
const TradingRoom = lazy(() => import('./pages/TradingRoom'));
const CompetitionAdmin = lazy(() => import('./pages/CompetitionAdmin'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();

  if (token) return <>{children}</>;

  const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
  return <Navigate to={`/login?next=${next}`} replace />;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <Navigate to="/competitions" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<GuestRoute><Login /></GuestRoute>} />
            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/competitions" element={<ProtectedRoute><Competitions /></ProtectedRoute>} />
            <Route path="/competition/:id/admin" element={<ProtectedRoute><CompetitionAdmin /></ProtectedRoute>} />
            <Route path="/competition/:id" element={<ProtectedRoute><TradingRoom /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-screen bg-surface text-gray-400 flex items-center justify-center text-sm">
      Loading...
    </div>
  );
}
