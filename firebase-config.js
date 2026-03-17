// firebase-config.js
// Replace the placeholder values below with your actual Firebase project credentials.
// To get these values:
//   1. Go to https://console.firebase.google.com
//   2. Create (or open) your project
//   3. Project Settings → General → Your apps → Web app → firebaseConfig

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Admin email – only this address will have admin privileges.
// Change this to your own email address.
const ADMIN_EMAIL = "your-admin-email@example.com";

// Initialize Firebase (compat mode – available as global `firebase` object)
firebase.initializeApp(firebaseConfig);

// Global references used across all scripts
const auth = firebase.auth();
const db   = firebase.firestore();
