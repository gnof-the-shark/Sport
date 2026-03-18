// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCT1SUk76IeBXkCbSSvbX4S-9sWQm8jQUU",
  authDomain: "project-83ac5791-18d5-4b8d-9d0.firebaseapp.com",
  projectId: "project-83ac5791-18d5-4b8d-9d0",
  storageBucket: "project-83ac5791-18d5-4b8d-9d0.firebasestorage.app",
  messagingSenderId: "505689731152",
  appId: "1:505689731152:web:e0ebc30028f6259e7ce155",
  measurementId: "G-0G99G1NCKQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
