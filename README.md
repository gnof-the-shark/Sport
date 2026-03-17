# 🏋️ Sport Tracker

Une application web complète pour suivre et partager vos performances sportives (redressements assis, pompes, squats, etc.) avec une communauté, un classement en temps réel et un panneau d'administration.

---

## ✅ Fonctionnalités

### 🔐 Authentification (deux niveaux)
- **Connexion / Inscription** par adresse e-mail et mot de passe
- **Google Sign-In** en un clic
- **Admin** : l'adresse e-mail définie dans `firebase-config.js` reçoit automatiquement les droits administrateur
- **Utilisateurs réguliers** : accès au dashboard personnel, enregistrement et classement

### 📊 Dashboard Personnel
- Total de répétitions toutes sessions confondues
- Compteur du jour
- Jours consécutifs d'activité (streak)
- Meilleur jour
- Graphique en barres des 7 derniers jours
- Votre position dans le classement global

### ➕ Enregistrement des séances
- Formulaire rapide avec boutons +5 / −5
- Note optionnelle pour chaque séance
- Sauvegarde instantanée sur Firebase
- Historique des 10 dernières séances

### 🏆 Classement (Leaderboard)
- Top 10 en **temps réel** grâce aux listeners Firestore
- Médailles 🥇🥈🥉 pour les trois premiers
- Votre propre ligne mise en évidence

### 🔄 Feed Communautaire
- Activité de tous les participants en temps réel
- Nom, sport, nombre de reps et heure de chaque séance
- Notes personnelles visibles par la communauté

### ⚙️ Panneau Admin (administrateur uniquement)
- **Réinitialiser tous les scores** : remet tous les compteurs à zéro (confirmation requise)
- **Lancer un nouveau concours** : nom, date de début, durée, description
- **Changer de sport** : sit-ups, pompes, squats, tractions, burpees, course, ou sport personnalisé
- **Gérer les utilisateurs** : liste complète, rôles, suppression de compte
- **Statistiques globales** : nombre d'utilisateurs, total de reps, séances du jour

---

## 🚀 Mise en place

### 1. Créer un projet Firebase

1. Allez sur [https://console.firebase.google.com](https://console.firebase.google.com)
2. Cliquez sur **Ajouter un projet** et suivez l'assistant
3. Dans le projet, activez :
   - **Authentication** → Méthodes de connexion → Email/Mot de passe ✅ et Google ✅
   - **Firestore Database** → Créer la base de données (mode production ou test)
4. Allez dans **Paramètres du projet** → **Vos applications** → Ajoutez une **application Web**
5. Copiez l'objet `firebaseConfig` affiché

### 2. Configurer l'application

Ouvrez `firebase-config.js` et remplacez les valeurs :

```js
const firebaseConfig = {
    apiKey:            "VOTRE_API_KEY",
    authDomain:        "votre-projet.firebaseapp.com",
    projectId:         "votre-projet",
    storageBucket:     "votre-projet.appspot.com",
    messagingSenderId: "VOTRE_SENDER_ID",
    appId:             "VOTRE_APP_ID"
};

const ADMIN_EMAIL = "votre-email-admin@exemple.com";
```

### 3. Règles Firestore (recommandées)

Dans la console Firebase → Firestore → Règles :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read all profiles, but only write their own
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Workouts: authenticated users can read all, write their own
    match /workouts/{docId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // Settings: only the admin can write
    match /settings/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.email == "votre-email-admin@exemple.com";
    }
  }
}
```

### 4. Lancer l'application

Ouvrez simplement `index.html` dans un navigateur, ou déployez sur :

- **Firebase Hosting** : `firebase deploy`
- **Netlify** : glissez-déposez le dossier dans [netlify.com](https://netlify.com)
- **GitHub Pages** : activez Pages sur la branche `main`

---

## 📂 Structure des fichiers

```
Sport/
├── index.html          # Interface complète (SPA)
├── styles.css          # Design moderne et responsive
├── app.js              # Logique principale (auth, workouts, leaderboard, feed)
├── admin.js            # Classe AdminPanel
├── firebase-config.js  # Configuration Firebase (à personnaliser)
└── README.md           # Cette documentation
```

---

## 🛠️ Technologies

- **Firebase Authentication** – connexion email + Google
- **Cloud Firestore** – base de données temps réel
- **HTML / CSS / JavaScript** vanilla – aucune dépendance frontend
- Design **responsive** (mobile-first)
