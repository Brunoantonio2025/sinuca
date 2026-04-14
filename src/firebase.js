import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDczLgmViLC0TYW4jYzzxjN9O7khxOFHQY",
  authDomain: "sinuca-40b0b.firebaseapp.com",
  projectId: "sinuca-40b0b",
  storageBucket: "sinuca-40b0b.firebasestorage.app",
  messagingSenderId: "5399606340",
  appId: "1:5399606340:web:e1510e005cc78d4524f811"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
