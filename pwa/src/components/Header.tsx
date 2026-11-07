import React from 'react';
import { Settings } from 'lucide-react';
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
        <div className="flex items-center gap-2 font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">
          <img
            src="./favicon-32x32.png"
            alt="Doodlebug Studio"
            className="w-6 h-6 object-contain drop-shadow-xs"
          />
          <span className="inline">Doodlebug</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* Settings / Account Button */}
        <button
          onClick={onOpenAuth}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center justify-center transition-all ${
            authState.isAuthenticated
              ? 'bg-white border-stone-200 text-slate-700 hover:bg-stone-100'
              : 'bg-stone-100 border-stone-200 text-slate-600 hover:bg-stone-200'
          }`}
          title={authState.isAuthenticated ? 'Studio Settings & Account' : 'Sign in to Studio'}
          aria-label="Settings and Account"
        >
          <Settings className="w-4 h-4 text-slate-600" />
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
