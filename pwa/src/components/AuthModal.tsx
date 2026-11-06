import React, { useState } from 'react';
import { X, Lock, LogIn, LogOut, CheckCircle, AlertCircle } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  signOut,
  UserCredential
} from 'firebase/auth';
import { getFirebaseAuth, initFirebase } from '../config/firebase';
import { AuthState } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authState: AuthState;
  onUpdateAuthState: (state: AuthState) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  authState,
  onUpdateAuthState,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    const auth = getFirebaseAuth();
    if (!auth) {
      setError('Firebase Auth client is not initialized');
      setIsLoading(false);
      return;
    }

    try {
      const { googleProvider } = initFirebase();
      if (!googleProvider) throw new Error('Google Provider not available');
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      onUpdateAuthState({
        isAuthenticated: true,
        user: {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
        },
        idToken,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-retro max-w-sm w-full p-5 space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-slate-800" />
            <h3 className="font-extrabold text-slate-900 text-base">VIP Creator Access 💖</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-xl hover:bg-stone-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Sign in so your nerd knows it's really you before publishing your website to the world!
        </p>

        {authState.isAuthenticated ? (
          /* Signed In State */
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Currently Signed In</span>
            </div>
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-bold">{authState.user?.displayName || 'Authorized User'}</p>
              <p className="font-mono text-[11px] text-slate-500">{authState.user?.email}</p>
              <p className="font-mono text-[10px] text-slate-400 break-all">UID: {authState.user?.uid}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full py-2 rounded-xl bg-white border border-stone-200 hover:bg-rose-50 hover:text-rose-600 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          /* Sign In Form */
          <div className="space-y-3">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleEmailSignIn} className="space-y-2.5">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className="w-full p-2.5 text-xs rounded-xl border border-stone-300 focus:outline-none focus:border-slate-900"
                  required
                />
              </div>
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full p-2.5 text-xs rounded-xl border border-stone-300 focus:outline-none focus:border-slate-900"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-retro-sm transition-all flex items-center justify-center gap-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>{isLoading ? 'Signing In...' : 'Sign In with Email'}</span>
              </button>
            </form>

            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full py-2 rounded-xl border border-stone-300 hover:bg-stone-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign In with Google</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
