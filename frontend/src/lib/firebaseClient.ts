// Firebase client setup - init app, get Auth and Firestore instances
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase web config from `frontend/.env.local` (see README).
 * Only `NEXT_PUBLIC_*` vars are exposed to the browser in Next.js.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function isConfigComplete(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

function getApp(): FirebaseApp {
  if (!isConfigComplete()) {
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      console.warn(
        "[Firebase] Missing env vars. Copy README template into frontend/.env.local and restart `npm run dev`."
      );
    }
    throw new Error(
      "Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local."
    );
  }
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
  }
  return app;
}

/** Firebase Auth (phone OTP, etc.) — use only in Client Components or after mount. */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getApp());
  }
  return auth;
}

/** Firestore — use only in Client Components or after mount. */
export function getFirebaseDb(): Firestore {
  if (!db) {
    db = getFirestore(getApp());
  }
  return db;
}

/** True when all Firebase web env vars are set (safe on server for branching). */
export function isFirebaseConfigured(): boolean {
  return isConfigComplete();
}