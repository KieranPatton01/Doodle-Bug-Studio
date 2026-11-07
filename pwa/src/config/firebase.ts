/**
 * Firebase Client SDK Initialization (Authentication Only - Free Spark Tier)
 * 
 * ZERO CLIENT SECRETS RULE:
 * This client contains NO GitHub PATs and NO Gemini API keys.
 * Firebase client config identifiers are public keys scoped strictly to Firebase Authentication.
 * Photos are uploaded to the GitHub img/ folder via the Cloudflare Worker.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
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
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  };
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function initFirebase(customConfig?: FirebaseClientConfig) {
  const config = customConfig || getFirebaseConfig();
  if (!config) {
    // Unconfigured: do not initialize Firebase with fake credentials that fail confusingly
    return { app: null, auth: null, googleProvider: null };
  }

  try {
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    return { app, auth, googleProvider: new GoogleAuthProvider() };
  } catch (err) {
    console.error('Firebase initialization error:', err);
    return { app: null, auth: null, googleProvider: null };
  }
}

export function getFirebaseAuth(): Auth | null {
  if (!auth) initFirebase();
  return auth;
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
}
