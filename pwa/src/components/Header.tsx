import React from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { AuthState } from '../types';

interface HeaderProps {
  onVibecode: () => void;
  isGenerating: boolean;
  authState: AuthState;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onVibecode,
  isGenerating,
  authState,
  onOpenAuth,
}) => {
  return (
    <header className="h-14 bg-butter/95 backdrop-blur-md border-b border-stone-200/90 px-3 sm:px-4 flex items-center justify-between gap-2 z-30 select-none">
      
      {/* Brand */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">
          <span className="text-xl">🐛</span>
          <span className="inline">Doodlebug</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* Auth Status Button */}
        <button
          onClick={onOpenAuth}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1 transition-all ${
            authState.isAuthenticated
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              : 'bg-stone-100 border-stone-200 text-slate-600 hover:bg-stone-200'
          }`}
          title={authState.isAuthenticated ? 'Signed in! Ready to publish 💖' : 'Sign in to publish your website!'}
        >
          {authState.isAuthenticated ? (
            <UserCheck className="w-4 h-4 text-emerald-600" />
          ) : (
            <UserX className="w-4 h-4 text-slate-400" />
          )}
          <span className="hidden sm:inline">
            {authState.isAuthenticated ? 'VIP Ready' : 'Sign in'}
          </span>
        </button>

        {/* Primary Action: GENERATE WEBPAGE */}
        <button
          onClick={onVibecode}
          disabled={isGenerating}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-retro-sm transition-all transform active:translate-x-0.5 active:translate-y-0.5 ${
            isGenerating
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-slate-900 hover:bg-slate-800 active:shadow-none'
          }`}
          title="Ask your nerd to build your website!"
        >
          <span>{isGenerating ? 'building webpage...🤓' : 'generate webpage🤓'}</span>
        </button>
      </div>

    </header>
  );
};
