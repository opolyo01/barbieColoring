import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const POST_LOGIN_REDIRECT_KEY = 'tradebattle_post_login_redirect';

function normalizeReturnTo(value: string | null): string {
  return value && value.startsWith('/') ? value : '/competitions';
}

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token') ?? searchParams.get('token');
    const error = searchParams.get('error');

    if (error || !token) {
      localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
      navigate(`/login?error=${encodeURIComponent(error ?? 'Sign-in failed')}`);
      return;
    }

    api.auth.me(token)
      .then((user) => {
        login(user, token);
        const returnTo = normalizeReturnTo(localStorage.getItem(POST_LOGIN_REDIRECT_KEY));
        localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        navigate(returnTo, { replace: true });
      })
      .catch(() => {
        localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        navigate('/login?error=Could+not+load+profile');
      });
  }, []);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">📈</div>
        <p className="text-gray-400 text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
