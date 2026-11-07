import React, { useState, useEffect } from 'react';
import { X, Lock, LogIn, LogOut, CheckCircle, AlertCircle } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  signOut,
  UserCredential
} from 'firebase/auth';
import { getFirebaseAuth } from '../config/firebase';
import { AuthState } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authState: AuthState;
  onUpdateAuthState: (state: AuthState) => void;
  isLockedGate?: boolean;
}

const LOCKOUT_STORAGE_KEY = 'doodlebug_login_lockout_until';
const ATTEMPTS_STORAGE_KEY = 'doodlebug_login_failed_attempts';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000; // 60 seconds cooldown after 5 failed attempts

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  authState,
  onUpdateAuthState,
  isLockedGate = false,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Sync cooldown timer from localStorage
  useEffect(() => {
    const checkCooldown = () => {
      try {
        const untilRaw = localStorage.getItem(LOCKOUT_STORAGE_KEY);
        if (!untilRaw) {
          setCooldownSeconds(0);
          return;
        }
        const until = parseInt(untilRaw, 10);
        const remaining = Math.ceil((until - Date.now()) / 1000);
        if (remaining > 0) {
          setCooldownSeconds(remaining);
        } else {
          localStorage.removeItem(LOCKOUT_STORAGE_KEY);
          localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
          setCooldownSeconds(0);
        }
      } catch {
        setCooldownSeconds(0);
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isOpen) return null;

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSeconds > 0) return;

    setIsLoading(true);
    setError(null);

    const auth = getFirebaseAuth();
    if (!auth) {
      setError('Firebase Auth client is not initialized');
      setIsLoading(false);
      return;
    }

    try {
      const userCredential: UserCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();
      try {
        localStorage.removeItem(LOCKOUT_STORAGE_KEY);
        localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      onUpdateAuthState({
        isAuthenticated: true,
        user: {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: userCredential.user.displayName,
        },
        idToken,
      });
      onClose();
    } catch (err) {
      let friendlyMsg = 'Incorrect email or password. Please try again.';
      const rawMsg = err instanceof Error ? err.message : String(err);

      if (rawMsg.includes('auth/too-many-requests')) {
        friendlyMsg = 'Too many failed login attempts! Firebase has temporarily locked sign-in for your protection. Please wait a few minutes.';
      }

      try {
        const prevAttempts = parseInt(localStorage.getItem(ATTEMPTS_STORAGE_KEY) || '0', 10) + 1;
        localStorage.setItem(ATTEMPTS_STORAGE_KEY, String(prevAttempts));
        if (prevAttempts >= MAX_FAILED_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_DURATION_MS;
          localStorage.setItem(LOCKOUT_STORAGE_KEY, String(until));
          setCooldownSeconds(Math.ceil(LOCKOUT_DURATION_MS / 1000));
          friendlyMsg = 'Too many attempts! Please wait 60 seconds before trying again.';
        }
      } catch {
        // ignore storage errors
      }

      setError(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        await signOut(auth);
      } catch (e) {
        // ignore
      }
    }
    onUpdateAuthState({
      isAuthenticated: false,
      user: null,
      idToken: null,
    });
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in ${
        isLockedGate && !authState.isAuthenticated
          ? 'bg-butter'
          : 'bg-black/40 backdrop-blur-xs'
      }`}
    >
      <div className="bg-white rounded-3xl border-2 border-stone-200 shadow-retro max-w-sm w-full p-6 sm:p-7 space-y-5 relative overflow-hidden">
        
        {/* Subtle top close button when opened as account modal */}
        {(!isLockedGate || authState.isAuthenticated) && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-stone-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Cute Centered Header */}
        <div className="text-center space-y-2 pt-1">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-pink-50 border-2 border-pink-200 shadow-retro-sm flex items-center justify-center text-2xl">
            🐛
          </div>
          <h3 className="font-extrabold text-slate-900 text-lg tracking-tight flex items-center justify-center gap-1.5">
            <span>Doodlebug Studio</span>
            <span>💖</span>
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-[260px] mx-auto">
            {authState.isAuthenticated
              ? 'Your private studio is unlocked and ready to doodle!'
              : 'Sign in to unlock your private drawing canvas and photo scrapbook.'}
          </p>
        </div>

        {authState.isAuthenticated ? (
          /* Signed In State */
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Currently Signed In</span>
            </div>
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-bold">{authState.user?.displayName || 'Authorized Creator'}</p>
              <p className="font-mono text-[11px] text-slate-500">{authState.user?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full py-2.5 rounded-xl bg-white border border-stone-200 hover:bg-rose-50 hover:text-rose-600 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          /* Simple & Pretty Email Sign In Form */
          <div className="space-y-3.5">
            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 pl-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={cooldownSeconds > 0}
                  className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-stone-50/70 border border-stone-200 focus:bg-white focus:outline-none focus:border-pink-400 transition-colors disabled:opacity-50"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 pl-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={cooldownSeconds > 0}
                  className="w-full px-3.5 py-2.5 text-xs rounded-2xl bg-stone-50/70 border border-stone-200 focus:bg-white focus:outline-none focus:border-pink-400 transition-colors disabled:opacity-50"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || cooldownSeconds > 0}
                className="w-full mt-1 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs shadow-retro-sm transition-all transform active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2"
              >
                {cooldownSeconds > 0 ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-pink-200" />
                    <span>Locked ({cooldownSeconds}s)</span>
                  </>
                ) : isLoading ? (
                  <>
                    <Lock className="w-3.5 h-3.5 animate-pulse text-pink-300" />
                    <span>Unlocking Studio...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-3.5 h-3.5 text-pink-300" />
                    <span>Enter Studio ✨</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
