import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDpVGLR1hvBUzWqS4rQ-KXTp94gDm9oGQ",
  authDomain: "bitam-telecom.firebaseapp.com",
  databaseURL: "https://bitam-telecom-default-rtdb.firebaseio.com",
  projectId: "bitam-telecom",
  storageBucket: "bitam-telecom.firebasestorage.googleapis.com",
  messagingSenderId: "100320013000",
  appId: "1:163362001380:web:de2800c72ce3e23ab615d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };