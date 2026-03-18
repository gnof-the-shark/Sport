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
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add("active");
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

    await db.collection("users").doc(currentUser.uid).set({
        totalReps: firebase.firestore.FieldValue.increment(reps)
    }, { merge: true });

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
    document.querySelectorAll(".auth-tab").forEach(btn => btn.classList.remove("active"));
    document.getElementById("tab-" + t).classList.add("active");
};

window.handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("auth-error");
    const btn = document.getElementById("login-btn");
    errEl.classList.add("hidden");
    btn.disabled = true;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
    } finally {
        btn.disabled = false;
    }
};

window.handleRegister = async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const errEl = document.getElementById("auth-error");
    const btn = document.getElementById("register-btn");
    errEl.classList.add("hidden");
    btn.disabled = true;
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        await db.collection("users").doc(cred.user.uid).set({
            displayName: name,
            email: email,
            totalReps: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
    } finally {
        btn.disabled = false;
    }
};

window.handleGoogleSignIn = async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    const errEl = document.getElementById("auth-error");
    errEl.classList.add("hidden");
    try {
        const cred = await auth.signInWithPopup(provider);
        const user = cred.user;
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (!userDoc.exists) {
            await db.collection("users").doc(user.uid).set({
                displayName: user.displayName || user.email,
                email: user.email,
                totalReps: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
    }
};

window.handleLogout = () => auth.signOut();
window.showTab = showTab;
window.submitWorkout = submitWorkout;
window.changeReps = (v) => {
    const i = document.getElementById("reps-input");
    i.value = Math.max(1, parseInt(i.value) + v);
};

window.openModal = (id) => document.getElementById(id).classList.remove("hidden");
window.closeModal = (id) => document.getElementById(id).classList.add("hidden");

window.adminResetScores = async () => {
    const input = document.getElementById("reset-confirm-input").value;
    if (input !== "RESET") { showToast("Tapez RESET pour confirmer", "error"); return; }
    await adminPanel.resetScores();
    closeModal("modal-reset");
    document.getElementById("reset-confirm-input").value = "";
};

window.adminStartCompetition = async () => {
    const name = document.getElementById("comp-name-input").value.trim();
    const start = document.getElementById("comp-start-input").value;
    const duration = parseInt(document.getElementById("comp-duration-input").value);
    const desc = document.getElementById("comp-desc-input").value.trim();
    if (!name || !start || !duration) { showToast("Veuillez remplir tous les champs obligatoires", "error"); return; }
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + duration * 86400000);
    await db.collection("settings").doc("competition").set({
        name,
        description: desc,
        startDate: firebase.firestore.Timestamp.fromDate(startDate),
        endDate: firebase.firestore.Timestamp.fromDate(endDate),
        active: true
    });
    showToast("Concours lancé !", "success");
    closeModal("modal-competition");
};

window.adminChangeSport = async () => {
    const sportKey = document.getElementById("sport-select").value;
    const customName = sportKey === "custom" ? document.getElementById("custom-sport-name").value.trim() : "";
    if (sportKey === "custom" && !customName) { showToast("Entrez un nom pour le sport personnalisé", "error"); return; }
    await adminPanel.changeSport(sportKey, customName);
    closeModal("modal-sport");
};

const sportSelect = document.getElementById("sport-select");
if (sportSelect) {
    sportSelect.addEventListener("change", (e) => {
        document.getElementById("custom-sport-group").classList.toggle("hidden", e.target.value !== "custom");
    });
}
