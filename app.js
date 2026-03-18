// app.js – Main application logic
const SPORTS = {
    "sit-ups":  { label: "Sit-ups",    icon: "🧘", unit: "reps" },
    "push-ups": { label: "Push-ups",   icon: "💪", unit: "reps" },
    "squats":   { label: "Squats",     icon: "🦵", unit: "reps" },
    "pull-ups": { label: "Pull-ups",   icon: "🏋️", unit: "reps" },
    "burpees":  { label: "Burpees",    icon: "🔥", unit: "reps" },
    "running":  { label: "Course",     icon: "🏃", unit: "km"   },
    "custom":   { label: "Sport",      icon: "⭐", unit: "reps" }
};

let currentUser = null;
let isAdmin = false;
let currentSport = "sit-ups";
let adminPanel = null;

// Listeners
let unsubLeaderboard = null;
let unsubFeed = null;

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

    if (isAdmin) {
        // Dans cette version, les éléments admin sont visibles si isAdmin est vrai
        document.getElementById("admin-badge").classList.remove("hidden");
        document.getElementById("admin-tab-btn").classList.remove("hidden");
        adminPanel = new AdminPanel(db, auth, ADMIN_EMAIL, showToast, updateSportUI, loadAdminStats);
    }

    const name = currentUser.displayName || currentUser.email;
    document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();

    await loadPlatformSettings();
    subscribeLeaderboard();
    subscribeFeed();
    await loadDashboard();
    showTab("dashboard");
}

function onUserSignedOut() {
    if (unsubLeaderboard) unsubLeaderboard();
    if (unsubFeed) unsubFeed();
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
}

async function loadPlatformSettings() {
    const snap = await db.collection("settings").doc("platform").get();
    if (snap.exists) currentSport = snap.data().currentSport || "sit-ups";
    updateSportUI(currentSport);
}

function updateSportUI(sportKey) {
    currentSport = sportKey;
    const sport = SPORTS[sportKey] || SPORTS["sit-ups"];
    document.getElementById("nav-sport-icon").textContent = sport.icon;
    document.getElementById("nav-sport-name").textContent = sport.label;
}

function showTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    document.getElementById("tab-" + tabName).classList.remove("hidden");
    if (tabName === "admin" && isAdmin) loadAdminStats();
}

async function loadDashboard() {
    const userDoc = await db.collection("users").doc(currentUser.uid).get();
    if (userDoc.exists) {
        document.getElementById("stat-total").textContent = userDoc.data().totalReps || 0;
    }
}

async function submitWorkout() {
    const reps = parseInt(document.getElementById("reps-input").value);
    if (!reps || reps < 1) return;
    
    await db.collection("workouts").add({
        userId: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email,
        sport: currentSport,
        reps: reps,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        dateStr: new Date().toISOString().slice(0, 10)
    });

    await db.collection("users").doc(currentUser.uid).update({
        totalReps: firebase.firestore.FieldValue.increment(reps)
    });

    showToast("Séance enregistrée !", "success");
    loadDashboard();
}

function subscribeLeaderboard() {
    unsubLeaderboard = db.collection("users").orderBy("totalReps", "desc").limit(10)
        .onSnapshot(snap => {
            const list = document.getElementById("leaderboard-list");
            list.innerHTML = "";
            snap.forEach((doc, i) => {
                const u = doc.data();
                const li = document.createElement("li");
                li.className = "leaderboard-item";
                li.innerHTML = `<span>#${i+1} ${u.displayName}</span> <strong>${u.totalReps}</strong>`;
                list.appendChild(li);
            });
        });
}

function subscribeFeed() {
    unsubFeed = db.collection("workouts").orderBy("timestamp", "desc").limit(10)
        .onSnapshot(snap => {
            const list = document.getElementById("community-feed");
            list.innerHTML = "";
            snap.forEach(doc => {
                const d = doc.data();
                const li = document.createElement("li");
                li.className = "feed-item";
                li.innerHTML = `<b>${d.displayName}</b> a fait ${d.reps} reps`;
                list.appendChild(li);
            });
        });
}

async function loadAdminStats() {
    const snap = await db.collection("users").get();
    document.getElementById("admin-stat-users").textContent = snap.size;
}

function showToast(m, t) {
    const toast = document.createElement("div");
    toast.className = `toast ${t}`;
    toast.textContent = m;
    document.getElementById("toast-container").appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Global functions for HTML
window.switchAuthTab = (t) => {
    document.getElementById("login-form").classList.toggle("hidden", t !== 'login');
    document.getElementById("register-form").classList.toggle("hidden", t !== 'register');
};
window.handleLogin = (e) => { e.preventDefault(); /* ... */ };
window.handleLogout = () => auth.signOut();
window.showTab = showTab;
window.submitWorkout = submitWorkout;
window.changeReps = (v) => {
    const i = document.getElementById("reps-input");
    i.value = Math.max(1, parseInt(i.value) + v);
};
