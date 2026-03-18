// Configuration de votre projet Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCT1SUk76IeBXkCbSSvbX4S-9sWQm8jQUU",
  authDomain: "project-83ac5791-18d5-4b8d-9d0.firebaseapp.com",
  projectId: "project-83ac5791-18d5-4b8d-9d0",
  storageBucket: "project-83ac5791-18d5-4b8d-9d0.firebasestorage.app",
  messagingSenderId: "505689731152",
  appId: "1:505689731152:web:e0ebc30028f6259e7ce155",
  measurementId: "G-0G99G1NCKQ"
};

// Initialisation de Firebase (Version Compat pour navigateur)
firebase.initializeApp(firebaseConfig);

// Rendre les services accessibles aux autres fichiers (app.js, admin.js)
const auth = firebase.auth();
const db   = firebase.firestore();

// --- CONFIGURATION ADMIN ---
// REMPLACEZ CECI par votre email pour avoir les accès de gestion
const ADMIN_EMAIL = "christophewhite14@gmail.com";
