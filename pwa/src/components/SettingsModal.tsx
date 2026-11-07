import React, { useState, useEffect } from 'react';
import { X, Globe, Save, CheckCircle2, AlertCircle, RefreshCw, Flame, Trash2 } from 'lucide-react';
import { getWorkerBaseUrl, setWorkerBaseUrl } from '../services/workerClient';
import { getFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig, FirebaseClientConfig } from '../config/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'worker' | 'firebase'>('worker');
  const [workerUrl, setUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [healthStatus, setHealthStatus] = useState<Record<string, unknown> | null>(null);

  // Firebase config state (Auth only - Free Spark Tier)
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbAuthDomain, setFbAuthDomain] = useState('');
  const [fbAppId, setFbAppId] = useState('');

  useEffect(() => {
    setUrl(getWorkerBaseUrl());
    const fb = getFirebaseConfig();
    if (fb) {
      setFbApiKey(fb.apiKey || '');
      setFbProjectId(fb.projectId || '');
      setFbAuthDomain(fb.authDomain || '');
      setFbAppId(fb.appId || '');
    }
    setErrorMessage(null);
    setStatusMessage(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveWorker = () => {
    setErrorMessage(null);
    try {
      setWorkerBaseUrl(workerUrl);
      setStatusMessage('Gateway URL saved successfully!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid Worker URL');
    }
  };

  const handleSaveFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!fbApiKey.trim() || !fbProjectId.trim()) {
      setErrorMessage('API Key and Project ID are required for Firebase.');
      return;
    }

    const config: FirebaseClientConfig = {
      apiKey: fbApiKey.trim(),
      projectId: fbProjectId.trim(),
      authDomain: fbAuthDomain.trim() || `${fbProjectId.trim()}.firebaseapp.com`,
      messagingSenderId: '',
      appId: fbAppId.trim(),
    };

    try {
      saveFirebaseConfig(config);
      setStatusMessage('Firebase configuration saved successfully!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save Firebase config');
    }
  };

  const handleClearFirebase = () => {
    clearFirebaseConfig();
    setFbApiKey('');
    setFbProjectId('');
    setFbAuthDomain('');
    setFbAppId('');
    setStatusMessage('Firebase configuration cleared from storage.');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const checkWorkerHealth = async () => {
    setIsChecking(true);
    setHealthStatus(null);
    setErrorMessage(null);

    const targetUrl = workerUrl.trim();
    if (!targetUrl) {
      setHealthStatus({ error: 'Worker URL is empty. Please enter your Cloudflare Worker URL first.' });
      setIsChecking(false);
      return;
    }

    try {
      const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/health`);
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        setHealthStatus(data);
      } else {
        setHealthStatus({ error: `Worker returned HTTP ${res.status}` });
      }
    } catch (err) {
      setHealthStatus({ error: 'Failed to connect: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-retro max-w-sm w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-slate-900 text-base">Backend & Cloud Settings</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-xl hover:bg-stone-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl text-xs font-semibold">
          <button
            onClick={() => { setActiveTab('worker'); setErrorMessage(null); }}
            className={`flex-1 py-1.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'worker' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Worker Gateway</span>
          </button>
          <button
            onClick={() => { setActiveTab('firebase'); setErrorMessage(null); }}
            className={`flex-1 py-1.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'firebase' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Firebase</span>
          </button>
        </div>

        {/* Tab 1: Cloudflare Worker Settings */}
        {activeTab === 'worker' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              The PWA routes Gemini Flash inference and GitHub commits through your Cloudflare Worker to protect secrets.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cloudflare Worker URL
              </label>
              <input
                type="url"
                value={workerUrl}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://doodlebug-gateway.<account>.workers.dev"
                className="w-full p-2.5 text-xs rounded-xl border border-stone-300 focus:outline-none focus:border-slate-900 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveWorker}
                className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save URL</span>
              </button>
              <button
                onClick={checkWorkerHealth}
                disabled={isChecking}
                className="px-3 py-2 rounded-xl border border-stone-300 hover:bg-stone-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                <span>Test Ping</span>
              </button>
            </div>

            {healthStatus && (
              <div className={`p-3 rounded-2xl text-xs space-y-1 font-mono ${
                healthStatus.error ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}>
                <div className="flex items-center gap-1.5 font-bold font-sans">
                  {healthStatus.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{healthStatus.error ? 'Connection Error' : 'Gateway Online'}</span>
                </div>
                {Boolean(healthStatus.target) && <div>Target: {String(healthStatus.target)}</div>}
                {Boolean(healthStatus.service) && <div>Service: {String(healthStatus.service)}</div>}
                {Boolean(healthStatus.error) && <div>{String(healthStatus.error)}</div>}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Firebase Client Config */}
        {activeTab === 'firebase' && (
          <form onSubmit={handleSaveFirebase} className="space-y-2.5">
            <p className="text-xs text-slate-500">
              Configure your public Firebase project identifiers for Authentication (Free Spark Tier). Photos are saved to your GitHub img/ folder.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Firebase API Key</label>
              <input
                type="text"
                value={fbApiKey}
                onChange={(e) => setFbApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full p-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:border-slate-900 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Firebase Project ID</label>
              <input
                type="text"
                value={fbProjectId}
                onChange={(e) => setFbProjectId(e.target.value)}
                placeholder="your-project-id"
                className="w-full p-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:border-slate-900 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Auth Domain (optional)</label>
              <input
                type="text"
                value={fbAuthDomain}
                onChange={(e) => setFbAuthDomain(e.target.value)}
                placeholder="your-project-id.firebaseapp.com"
                className="w-full p-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:border-slate-900 font-mono"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Config</span>
              </button>
              <button
                type="button"
                onClick={handleClearFirebase}
                className="p-2 rounded-xl border border-stone-300 hover:bg-rose-50 text-rose-600 text-xs font-semibold flex items-center justify-center transition-colors"
                title="Clear Stored Config"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Global Feedback */}
        {statusMessage && (
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{statusMessage}</span>
          </p>
        )}

        {errorMessage && (
          <p className="text-xs text-rose-600 font-semibold flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{errorMessage}</span>
          </p>
        )}

      </div>
    </div>
  );
};
