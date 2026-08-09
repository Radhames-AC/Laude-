import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDtu_D6i8A7mSqknefmaufpyx5_WLMmA2U",
  authDomain: "teachers-tracker-by-radha.firebaseapp.com",
  projectId: "teachers-tracker-by-radha",
  storageBucket: "teachers-tracker-by-radha.firebasestorage.app",
  messagingSenderId: "858323250848",
  appId: "1:858323250848:web:fbc2839a486ecbf7b863c5",
  measurementId: "G-3YNTWQCJRL"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/tasks');
