import React, { useState } from 'react';
import { signInWithGoogle } from '../services/auth';

interface SignInGateProps {
  children: React.ReactNode;
  user: any | null;
  loading: boolean;
  leagueName?: string;
}

export const SignInGate: React.FC<SignInGateProps> = ({
  children,
  user,
  loading,
  leagueName,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Failed to sign in with Google');
      }
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sleeper-dark text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-full border-4 border-sleeper-accent/20 border-t-sleeper-accent animate-spin mb-4" />
        <p className="text-sm text-gray-400 font-medium">Checking authentication...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-sleeper-dark text-white flex items-center justify-center p-4">
        <div className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-md p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-sleeper-accent/10 border border-sleeper-accent/20 flex items-center justify-center mx-auto mb-5 text-3xl shadow-inner">
            🏈
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
            Team Parlay Tracker
          </h2>

          <p className="text-xs sm:text-sm text-gray-300 mt-2 mb-6 leading-relaxed">
            {leagueName
              ? `Sign in with your Google account to submit picks and track parlays for ${leagueName}.`
              : 'Sign in with your Google account to view the weekly parlay slip and submit your team pick.'}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-sm transition flex items-center justify-center space-x-3 shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {signingIn ? (
              <div className="w-5 h-5 rounded-full border-2 border-gray-400 border-t-gray-900 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{signingIn ? 'Connecting to Google...' : 'Sign in with Google'}</span>
          </button>

          <p className="text-[11px] text-sleeper-muted mt-5">
            Your identity will be linked to your fantasy picks and claim status.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
