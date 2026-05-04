import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL ?? '';

export default function Login() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  function signIn(provider: 'google' | 'facebook') {
    window.location.href = `${API}/api/auth/${provider}`;
  }

  useEffect(() => {
    localStorage.removeItem('tradebattle_auth');
  }, []);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <span className="text-5xl">📈</span>
          <h1 className="text-3xl font-bold text-white mt-3">TradeBattle</h1>
          <p className="text-gray-400 mt-1">Compete. Trade. Win.</p>
        </div>

        <div className="bg-panel border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-center text-sm text-gray-400 mb-2">Sign in to join a competition</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2 text-center">
              {decodeURIComponent(error)}
            </div>
          )}

          <button
            onClick={() => signIn('google')}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-lg py-3 text-sm transition-colors"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <button
            onClick={() => signIn('facebook')}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold rounded-lg py-3 text-sm transition-colors"
          >
            <FacebookIcon />
            Continue with Facebook
          </button>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          By signing in you agree to the platform rules.<br />
          No real money involved — virtual portfolios only.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
}
