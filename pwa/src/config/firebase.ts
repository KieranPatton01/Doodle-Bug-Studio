/**
 * Firebase Client SDK Initialization (Auth & Storage)
 * 
 * ZERO CLIENT SECRETS RULE:
 * This client contains NO GitHub PATs and NO Gemini API keys.
 * Firebase client config identifiers are public keys scoped to Auth and Storage rules.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Read config from localStorage or Vite environment variables
export function getFirebaseConfig(): FirebaseClientConfig | null {
  const stored = localStorage.getItem('doodlebug_firebase_config');
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as FirebaseClientConfig;
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    } catch (e) {
      // ignore
    }
  }

  const envKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProj = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  // Refuse fake placeholders or missing config
  if (
    !envKey ||
    !envProj ||
    envKey.includes('PlaceholderKey123') ||
    envKey.includes('...') ||
    envProj === 'doodlebug-cms' ||
    envProj === 'your-project-id'
  ) {
    return null;
  }

  return {
    apiKey: envKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProj}.firebaseapp.com`,
    projectId: envProj,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${envProj}.appspot.com`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  };
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

export function initFirebase(customConfig?: FirebaseClientConfig) {
  const config = customConfig || getFirebaseConfig();
  if (!config) {
    // Unconfigured: do not initialize Firebase with fake credentials that fail confusingly
    return { app: null, auth: null, storage: null, googleProvider: null };
  }

  try {
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    storage = getStorage(app);
    return { app, auth, storage, googleProvider: new GoogleAuthProvider() };
  } catch (err) {
    console.error('Firebase initialization error:', err);
    return { app: null, auth: null, storage: null, googleProvider: null };
  }
}

export function getFirebaseAuth(): Auth | null {
  if (!auth) initFirebase();
  return auth;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  if (!storage) initFirebase();
  return storage;
}

export function saveFirebaseConfig(config: FirebaseClientConfig) {
  localStorage.setItem('doodlebug_firebase_config', JSON.stringify(config));
  // Reinitialize with the new configuration
  initFirebase(config);
}

export function clearFirebaseConfig() {
  localStorage.removeItem('doodlebug_firebase_config');
  app = null;
  auth = null;
  storage = null;
}
