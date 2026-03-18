// app.js – Logique principale de Sport Tracker
// Dépendances : firebase-config.js (auth, db, ADMIN_EMAIL) et admin.js (AdminPanel)

/* ================================================================
   CONFIGURATION DES SPORTS
================================================================ */
const SPORTS = {
    "sit-ups":  { label: "Sit-ups",    icon: "🧘", unit: "reps" },
    "push-ups": { label: "Push-ups",   icon: "💪", unit: "reps" },
    "squats":   { label: "Squats",     icon: "🦵", unit: "reps" },
    "pull-ups": { label: "Pull-ups",   icon: "🏋️", unit: "reps" },
    "burpees":  { label: "Burpees",    icon: "🔥", unit: "reps" },
    "running":  { label: "Course",     icon: "🏃", unit: "km"   },
    "custom":   { label: "Sport",      icon: "⭐", unit: "reps" }
};

/* ================================================================
   ÉTAT DE L'APPLICATION (STATE)
================================================================ */
let currentUser      = null;
let isAdmin          = false;
let currentSport     = "sit-ups";
let activeCompetition = null;
let compTimerInterval = null;
let adminPanel        = null;

// Ecouteurs Firestore (pour pouvoir les couper à la déconnexion)
let unsubLeaderboard = null;
let unsubFeed        = null;
let unsubCompetition = null;

/* ================================================================
   AUTHENTIFICATION
================================================================ */

function switchAuthTab(tab) {
    document.getElementById("tab-login").classList.toggle("active",    tab === "login");
    document.getElementById("tab-register").classList.toggle("active", tab === "register");
    document.getElementById("login-form").classList.toggle("hidden",    tab !== "login");
    document.getElementById("register-form").classList.toggle("hidden", tab !== "register");
    hideAuthError();
}

function showAuthError(msg) {
    const el = document.getElementById("auth-error");
    el.textContent = msg;
    el.classList.remove("hidden");
}

function hideAuthError() {
    document.getElementById("auth-error").classList.add("hidden");
}

async function handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    hideAuthError();
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        showAuthError(friendlyAuthError(err.code));
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name     = document.getElementById("reg-name").value.trim();
    const email    = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    hideAuthError();
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        await db.collection("users").doc(cred.user.uid).set({
            displayName: name,
            email: email,
            role: email === ADMIN_EMAIL ? "admin" : "user",
            totalReps: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        showAuthError(friendlyAuthError(err.code));
    }
}

async function handleGoogleSignIn() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const cred = await auth.signInWithPopup(provider);
        const user = cred.user;
        const snap = await db.collection("users").doc(user.uid).get();
        if (!snap.exists) {
            await db.collection("users").doc(user.uid).set({
                displayName: user.displayName || "Sportif",
                email: user.email,
                role: user.email === ADMIN_EMAIL ? "admin" : "user",
                totalReps: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        showAuthError("Erreur de connexion avec Google.");
    }
}

async function handleLogout() {
    await auth.signOut();
}

function friendlyAuthError(code) {
    const messages = {
        "auth/user-not-found": "Compte inexistant.",
        "auth/wrong-password": "Mot de passe erroné.",
        "auth/email-already-in-use": "E-mail déjà utilisé.",
        "auth/weak-password": "Mot de passe trop court."
    };
    return messages[code] || "Une erreur est survenue.";
}

/* ================================================================
   OBSERVATEUR D'ÉTAT (LOGIN/LOGOUT)
================================================================ */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        isAdmin = (user.email === ADMIN_EMAIL);
        await onUserSignedIn();
    } else {
        onUserSignedOut();
    }
});

async function onUserSignedIn() {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");

    // UI Admin
    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        adminPanel = new AdminPanel(db, auth, ADMIN_EMAIL, showToast, updateSportUI, loadAdminStats);
    }

    // Avatar
    const name = currentUser.displayName || currentUser.email;
    document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();

    // Init App
    await loadPlatformSettings();
    subscribeLeaderboard();
    subscribeFeed();
    subscribeCompetition();
    await loadDashboard();
    showTab("dashboard");
}

function onUserSignedOut() {
    if (unsubLeaderboard) unsubLeaderboard();
    if (unsubFeed) unsubFeed();
    if (unsubCompetition) unsubCompetition();
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
}

/* ================================================================
   LOGIQUE MÉTIER (DASHBOARD, WORKOUTS, ETC.)
================================================================ */

async function loadPlatformSettings() {
    try {
        const snap = await db.collection("settings").doc("platform").get();
        if (snap.exists) currentSport = snap.data().currentSport || "sit-ups";
    } catch (e) { console.error(e); }
    updateSportUI(currentSport);
}

function updateSportUI(sportKey) {
    const sport = SPORTS[sportKey] || SPORTS["sit-ups"];
    document.getElementById("nav-sport-icon").textContent = sport.icon;
    document.getElementById("nav-sport-name").textContent = sport.label;
}

function showTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    document.getElementById("tab-" + tabName).classList.remove("hidden");
    
    if (tabName === "admin" && isAdmin) loadAdminStats();
    if (tabName === "log") loadMySessions();
}

async function loadDashboard() {
    const userDoc = await db.collection("users").doc(currentUser.uid).get();
    if (userDoc.exists) {
        document.getElementById("stat-total").textContent = userDoc.data().totalReps || 0;
    }
    // Calcul aujourd'hui
    const today = todayDateStr();
    const snap = await db.collection("workouts")
        .where("userId", "==", currentUser.uid)
        .where("dateStr", "==", today).get();
    let totalToday = 0;
    snap.forEach(doc => totalToday += doc.data().reps);
    document.getElementById("stat-today").textContent = totalToday;
}

async function submitWorkout() {
    const reps = parseInt(document.getElementById("reps-input").value);
    const note = document.getElementById("log-note").value.trim();
    if (!reps || reps < 1) return;

    try {
        await db.collection("workouts").add({
            userId: currentUser.uid,
            displayName: currentUser.displayName || currentUser.email,
            sport: currentSport,
            reps: reps,
            note: note,
            dateStr: todayDateStr(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection("users").doc(currentUser.uid).update({
            totalReps: firebase.firestore.FieldValue.increment(reps)
        });

        showToast(`Bravo ! +${reps} ${currentSport}`, "success");
        document.getElementById("log-note").value = "";
        loadDashboard();
        loadMySessions();
    } catch (err) {
        showToast("Erreur lors de l'enregistrement", "error");
    }
}

/* ================================================================
   FLUX TEMPS RÉEL
================================================================ */

function subscribeLeaderboard() {
    unsubLeaderboard = db.collection("users")
        .orderBy("totalReps", "desc").limit(10)
        .onSnapshot(snap => {
            const list = document.getElementById("leaderboard-list");
            list.innerHTML = "";
            snap.forEach((doc, i) => {
                const user = doc.data();
                const li = document.createElement("li");
                li.className = "leaderboard-item";
                li.innerHTML = `<span>#${i+1} ${escapeHtml(user.displayName)}</span> <strong>${user.totalReps}</strong>`;
                list.appendChild(li);
            });
        });
}

function subscribeFeed() {
    unsubFeed = db.collection("workouts")
        .orderBy("timestamp", "desc").limit(15)
        .onSnapshot(snap => {
            const list = document.getElementById("community-feed");
            list.innerHTML = "";
            snap.forEach(doc => {
                const data = doc.data();
                const li = document.createElement("li");
                li.className = "feed-item";
                li.innerHTML = `<b>${escapeHtml(data.displayName)}</b> : ${data.reps} reps (${data.sport})`;
                list.appendChild(li);
            });
        });
}

function subscribeCompetition() {
    unsubCompetition = db.collection("settings").doc("competition")
        .onSnapshot(snap => {
            const banner = document.getElementById("competition-banner");
            if (snap.exists && snap.data().active) {
                banner.classList.remove("hidden");
                document.getElementById("comp-title").textContent = snap.data().name;
            } else {
                banner.classList.add("hidden");
            }
        });
}

/* ================================================================
   OUTILS & HELPERS
================================================================ */

function showToast(msg, type) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.getElementById("toast-container").appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function todayDateStr() { return new Date().toISOString().slice(0, 10); }

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Exportation des fonctions pour le HTML (window.xxx)
window.switchAuthTab = switchAuthTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleLogout = handleLogout;
window.showTab = showTab;
window.submitWorkout = submitWorkout;
window.changeReps = (d) => {
    const i = document.getElementById("reps-input");
    i.value = Math.max(1, parseInt(i.value) + d);
};
