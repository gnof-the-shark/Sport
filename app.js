app.js complet // app.js – Main application logic for Sport Tracker
// Depends on: firebase-config.js (firebase, auth, db, ADMIN_EMAIL) and admin.js (AdminPanel)

/* ================================================================
   SPORT CONFIGURATION
================================================================ */
const SPORTS = {
    "sit-ups":  { label: "Sit-ups",    icon: "🧘", unit: "reps" },
    "push-ups": { label: "Push-ups",   icon: "💪", unit: "reps" },
    "squats":   { label: "Squats",     icon: "🦵", unit: "reps" },
    "pull-ups": { label: "Pull-ups",   icon: "🏋️", unit: "reps" },
    "burpees":  { label: "Burpees",    icon: "🔥", unit: "reps" },
    "running":  { label: "Course",     icon: "🏃", unit: "km"   },
    "custom":   { label: "Sport",      icon: "⭐", unit: "reps" }
};

/* ================================================================
   STATE
================================================================ */
let currentUser      = null;
let isAdmin          = false;
let currentSport     = "sit-ups";
let activeCompetition = null;
let compTimerInterval = null;
let adminPanel        = null;

// Firestore unsubscribe handles
let unsubLeaderboard = null;
let unsubFeed        = null;
let unsubCompetition = null;

/* ================================================================
   AUTH
================================================================ */

/** Switch between Login / Register tabs on the auth screen */
function switchAuthTab(tab) {
    document.getElementById("tab-login").classList.toggle("active",    tab === "login");
    document.getElementById("tab-register").classList.toggle("active", tab === "register");
    document.getElementById("login-form").classList.toggle("hidden",    tab !== "login");
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
    const email    = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn      = document.getElementById("login-btn");
    btn.disabled   = true;
    btn.innerHTML  = '<span class="spinner"></span> Connexion…';
    hideAuthError();
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        showAuthError(friendlyAuthError(err.code));
        btn.disabled  = false;
        btn.innerHTML = "Se connecter";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name     = document.getElementById("reg-name").value.trim();
    const email    = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const btn      = document.getElementById("register-btn");
    btn.disabled   = true;
    btn.innerHTML  = '<span class="spinner"></span> Création…';
    hideAuthError();
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        // Create user document in Firestore
        await db.collection("users").doc(cred.user.uid).set({
            displayName: name,
            email:       email,
            role:        email === ADMIN_EMAIL ? "admin" : "user",
            totalReps:   0,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        showAuthError(friendlyAuthError(err.code));
        btn.disabled  = false;
        btn.innerHTML = "Créer un compte";
    }
}

async function handleGoogleSignIn() {
    hideAuthError();
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const cred     = await auth.signInWithPopup(provider);
        const user     = cred.user;
        // Create user doc if first sign-in
        const snap = await db.collection("users").doc(user.uid).get();
        if (!snap.exists) {
            await db.collection("users").doc(user.uid).set({
                displayName: user.displayName || "Utilisateur",
                email:       user.email,
                role:        user.email === ADMIN_EMAIL ? "admin" : "user",
                totalReps:   0,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        showAuthError(friendlyAuthError(err.code));
    }
}

async function handleLogout() {
    await auth.signOut();
}

function friendlyAuthError(code) {
    const messages = {
        "auth/user-not-found":       "Aucun compte trouvé avec cet e-mail.",
        "auth/wrong-password":       "Mot de passe incorrect.",
        "auth/invalid-email":        "Adresse e-mail invalide.",
        "auth/email-already-in-use": "Cette adresse e-mail est déjà utilisée.",
        "auth/weak-password":        "Mot de passe trop faible (min. 6 caractères).",
        "auth/too-many-requests":    "Trop de tentatives. Réessayez plus tard.",
        "auth/popup-closed-by-user": "Connexion annulée.",
        "auth/invalid-credential":   "Identifiants invalides."
    };
    return messages[code] || "Une erreur est survenue. Réessayez.";
}

/* ================================================================
   AUTH STATE OBSERVER
================================================================ */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        isAdmin     = (user.email === ADMIN_EMAIL);
        await onUserSignedIn();
    } else {
        currentUser = null;
        isAdmin     = false;
        onUserSignedOut();
    }
});

async function onUserSignedIn() {
    // Switch to app screen
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");

    // Set up navbar
    const name   = currentUser.displayName || currentUser.email;
    const initials = name.charAt(0).toUpperCase();
    document.getElementById("user-avatar").textContent = initials;
    document.getElementById("user-avatar").title       = name;

    if (isAdmin) {
        document.getElementById("admin-badge").classList.remove("hidden");
        document.getElementById("admin-tab-btn").classList.remove("hidden");
        adminPanel = new AdminPanel(db, auth, ADMIN_EMAIL, showToast, updateSportUI, loadAdminStats);
    }

    // Make sure user doc exists (e.g. for email/password users who registered before we created the doc)
    const userDoc = await db.collection("users").doc(currentUser.uid).get();
    if (!userDoc.exists) {
        await db.collection("users").doc(currentUser.uid).set({
            displayName: currentUser.displayName || currentUser.email,
            email:       currentUser.email,
            role:        isAdmin ? "admin" : "user",
            totalReps:   0,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    // Load platform settings (sport, active competition)
    await loadPlatformSettings();

    // Start subscriptions
    subscribeLeaderboard();
    subscribeFeed();
    subscribeCompetition();

    // Load personal dashboard
    await loadDashboard();

    showTab("dashboard");
}

function onUserSignedOut() {
    // Unsubscribe real-time listeners
    if (unsubLeaderboard) { unsubLeaderboard(); unsubLeaderboard = null; }
    if (unsubFeed)        { unsubFeed();        unsubFeed = null; }
    if (unsubCompetition) { unsubCompetition(); unsubCompetition = null; }
    if (compTimerInterval) { clearInterval(compTimerInterval); compTimerInterval = null; }

    // Switch back to auth screen
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");

    // Reset forms
    document.getElementById("login-form").reset();
    document.getElementById("register-form").reset();
    hideAuthError();
}

/* ================================================================
   PLATFORM SETTINGS (sport, competition)
================================================================ */
async function loadPlatformSettings() {
    try {
        const snap = await db.collection("settings").doc("platform").get();
        if (snap.exists) {
            const data = snap.data();
            currentSport = data.currentSport || "sit-ups";
        }
    } catch (_) {
        currentSport = "sit-ups";
    }
    updateSportUI(currentSport);
}

function updateSportUI(sportKey, customLabel) {
    currentSport = sportKey;
    const sport  = SPORTS[sportKey] || SPORTS["sit-ups"];
    const label  = customLabel || sport.label;

    document.getElementById("nav-sport-icon").textContent  = sport.icon;
    document.getElementById("nav-sport-name").textContent  = label;
    document.getElementById("lb-sport-name").textContent   = label;
    document.getElementById("stat-sport-label").textContent = label.toLowerCase();
}

/* ================================================================
   TAB NAVIGATION
================================================================ */
function showTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

    const content = document.getElementById("tab-" + tabName);
    const btn     = document.querySelector('[data-tab="' + tabName + '"]');
    if (content) content.classList.remove("hidden");
    if (btn)     btn.classList.add("active");

    // Lazy-load tab content
    if (tabName === "leaderboard") renderLeaderboard();
    if (tabName === "feed")        renderFeed();
    if (tabName === "admin" && isAdmin) loadAdminStats();
}

/* ================================================================
   DASHBOARD
================================================================ */
async function loadDashboard() {
    try {
        const userDoc = await db.collection("users").doc(currentUser.uid).get();
        if (!userDoc.exists) return;
        const data = userDoc.data();

        document.getElementById("stat-total").textContent = data.totalReps || 0;

        // Today's reps
        const today     = todayDateStr();
        const todaySnap = await db.collection("workouts")
            .where("userId",   "==", currentUser.uid)
            .where("sport",    "==", currentSport)
            .where("dateStr",  "==", today)
            .get();
        let todayTotal = 0;
        todaySnap.forEach(doc => { todayTotal += doc.data().reps || 0; });
        document.getElementById("stat-today").textContent = todayTotal;

        // Best day (from weekly data)
        await loadWeeklyChart();

        // Streak
        const streak = await computeStreak();
        document.getElementById("stat-streak").textContent = streak;

        // Rank
        await loadMyRank();

    } catch (err) {
        console.error("Dashboard load error:", err);
    }
}

async function loadWeeklyChart() {
    const days   = last7Days();
    const snapshots = await Promise.all(days.map(d =>
        db.collection("workouts")
            .where("userId",  "==", currentUser.uid)
            .where("sport",   "==", currentSport)
            .where("dateStr", "==", d)
            .get()
    ));

    const values = snapshots.map(snap => {
        let total = 0;
        snap.forEach(doc => { total += doc.data().reps || 0; });
        return total;
    });

    const maxVal = Math.max(...values, 1);
    let bestDay  = 0;

    const container = document.getElementById("weekly-chart");
    container.innerHTML = "";

    values.forEach((v, i) => {
        const heightPct = Math.round((v / maxVal) * 100);
        const dayLabel  = new Date(days[i] + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short" });
        const wrap      = document.createElement("div");
        wrap.className  = "chart-bar-wrap";
        wrap.innerHTML  = `
            <div class="chart-bar" style="height:${heightPct}%;background:${v > 0 ? 'linear-gradient(180deg,var(--primary),var(--primary-dark))' : 'var(--border)'};" title="${v} reps"></div>
            <span class="chart-bar-label">${dayLabel}</span>
        `;
        container.appendChild(wrap);
        if (v > bestDay) bestDay = v;
    });

    document.getElementById("stat-best").textContent = bestDay;
}

async function computeStreak() {
    // Fetch all workout dates in a single query, then compute streak in memory
    const snap = await db.collection("workouts")
        .where("userId", "==", currentUser.uid)
        .where("sport",  "==", currentSport)
        .get();

    const dateSet = new Set();
    snap.forEach(doc => {
        const d = doc.data().dateStr;
        if (d) dateSet.add(d);
    });

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d    = new Date(today);
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().slice(0, 10);
        if (!dateSet.has(dStr)) break;
        streak++;
    }
    return streak;
}

async function loadMyRank() {
    const snap = await db.collection("users").orderBy("totalReps", "desc").get();
    let rank = 1;
    let found = false;
    snap.forEach(doc => {
        if (found) return;
        if (doc.id === currentUser.uid) { found = true; return; }
        rank++;
    });
    const total = snap.size;
    const el    = document.getElementById("my-rank-info");
    if (found || snap.size === 0) {
        el.innerHTML = `Vous êtes <strong style="color:var(--primary);font-size:1.2rem;">#${rank}</strong> sur ${total} participant${total > 1 ? "s" : ""}.`;
    } else {
        el.textContent = "Aucune donnée disponible.";
    }
}

/* ================================================================
   WORKOUT LOGGING
================================================================ */
function changeReps(delta) {
    const input = document.getElementById("reps-input");
    const val   = parseInt(input.value, 10) || 0;
    input.value = Math.max(1, val + delta);
}

async function submitWorkout() {
    const reps = parseInt(document.getElementById("reps-input").value, 10);
    const note = document.getElementById("log-note").value.trim();
    if (!reps || reps < 1) { showToast("⚠️ Entrez un nombre valide de répétitions.", "error"); return; }

    const btn         = document.getElementById("log-submit-btn");
    btn.disabled      = true;
    btn.innerHTML     = '<span class="spinner"></span> Enregistrement…';

    try {
        const today = todayDateStr();
        const now   = new Date();

        // Add workout document
        await db.collection("workouts").add({
            userId:      currentUser.uid,
            displayName: currentUser.displayName || currentUser.email,
            sport:       currentSport,
            reps:        reps,
            note:        note,
            dateStr:     today,
            timestamp:   firebase.firestore.FieldValue.serverTimestamp()
        });

        // Increment user totalReps
        await db.collection("users").doc(currentUser.uid).update({
            totalReps: firebase.firestore.FieldValue.increment(reps)
        });

        showToast(`✅ ${reps} reps enregistrés !`, "success");
        document.getElementById("reps-input").value = 10;
        document.getElementById("log-note").value   = "";
        await loadDashboard();
        await loadMySessions();

    } catch (err) {
        console.error("submitWorkout error:", err);
        showToast("❌ Erreur lors de l'enregistrement.", "error");
    } finally {
        btn.disabled  = false;
        btn.innerHTML = "💾 Enregistrer";
    }
}

async function loadMySessions() {
    const list = document.getElementById("my-sessions-list");
    list.innerHTML = "";
    try {
        const snap = await db.collection("workouts")
            .where("userId", "==", currentUser.uid)
            .orderBy("timestamp", "desc")
            .limit(10)
            .get();

        if (snap.empty) {
            list.innerHTML = "<li style='color:var(--text-muted);font-size:0.9rem;'>Aucune séance enregistrée.</li>";
            return;
        }
        snap.forEach(doc => {
            const d  = doc.data();
            const ts = d.timestamp ? d.timestamp.toDate() : new Date();
            const li = document.createElement("li");
            li.className = "feed-item";
            li.innerHTML = `
                <div class="feed-avatar">${d.reps}</div>
                <div class="feed-content">
                    <div class="feed-header">
                        <span class="feed-name">${d.reps} reps – ${(SPORTS[d.sport] || {label:d.sport}).label}</span>
                        <span class="feed-time">${formatDate(ts)}</span>
                    </div>
                    ${d.note ? `<div class="feed-note">"${escapeHtml(d.note)}"</div>` : ""}
                </div>
            `;
            list.appendChild(li);
        });
    } catch (err) {
        console.error("loadMySessions error:", err);
        list.innerHTML = "<li style='color:var(--danger);font-size:0.9rem;'>Erreur de chargement.</li>";
    }
}

// Load sessions when switching to log tab
document.addEventListener("DOMContentLoaded", () => {
    document.querySelector('[data-tab="log"]').addEventListener("click", loadMySessions);
    // Sport select custom option toggle
    document.getElementById("sport-select").addEventListener("change", () => {
        const v = document.getElementById("sport-select").value;
        document.getElementById("custom-sport-group").classList.toggle("hidden", v !== "custom");
    });
});

/* ================================================================
   LEADERBOARD (real-time)
================================================================ */
let leaderboardData = [];

function subscribeLeaderboard() {
    if (unsubLeaderboard) unsubLeaderboard();
    unsubLeaderboard = db.collection("users")
        .orderBy("totalReps", "desc")
        .limit(10)
        .onSnapshot(snap => {
            leaderboardData = [];
            snap.forEach(doc => {
                leaderboardData.push({ id: doc.id, ...doc.data() });
            });
            renderLeaderboard();
        }, err => { console.error("Leaderboard snapshot error:", err); });
}

function renderLeaderboard() {
    const list = document.getElementById("leaderboard-list");
    if (!leaderboardData.length) {
        list.innerHTML = "<li style='color:var(--text-muted);font-size:0.9rem;padding:0.5rem;'>Aucun participant pour l'instant.</li>";
        return;
    }
    list.innerHTML = "";
    leaderboardData.forEach((user, i) => {
        const rank     = i + 1;
        const rankClass = rank <= 3 ? "rank-" + rank : "";
        const medal    = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
        const isMe     = currentUser && user.id === currentUser.uid;
        const li       = document.createElement("li");
        li.className   = `leaderboard-item ${rankClass}`;
        li.innerHTML   = `
            <div class="rank-badge">${typeof medal === "string" ? medal : "#" + rank}</div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${escapeHtml(user.displayName || "Anonyme")}${isMe ? " <small style='color:var(--primary);'>(vous)</small>" : ""}</div>
                <div class="leaderboard-sub">${user.email || ""}</div>
            </div>
            <div class="leaderboard-score">${user.totalReps || 0}</div>
        `;
        list.appendChild(li);
    });
}

/* ================================================================
   COMMUNITY FEED (real-time)
================================================================ */
let feedData = [];

function subscribeFeed() {
    if (unsubFeed) unsubFeed();
    unsubFeed = db.collection("workouts")
        .orderBy("timestamp", "desc")
        .limit(20)
        .onSnapshot(snap => {
            feedData = [];
            snap.forEach(doc => { feedData.push({ id: doc.id, ...doc.data() }); });
            renderFeed();
        }, err => { console.error("Feed snapshot error:", err); });
}

function renderFeed() {
    const list = document.getElementById("community-feed");
    if (!feedData.length) {
        list.innerHTML = "<li style='color:var(--text-muted);font-size:0.9rem;'>Aucune activité récente.</li>";
        return;
    }
    list.innerHTML = "";
    feedData.forEach(entry => {
        const name    = entry.displayName || "Anonyme";
        const ts      = entry.timestamp ? entry.timestamp.toDate() : new Date();
        const sportObj = SPORTS[entry.sport] || { label: entry.sport || "Sport", icon: "⭐" };
        const li      = document.createElement("li");
        li.className  = "feed-item";
        li.innerHTML  = `
            <div class="feed-avatar">${name.charAt(0).toUpperCase()}</div>
            <div class="feed-content">
                <div class="feed-header">
                    <span class="feed-name">${escapeHtml(name)}</span>
                    <span class="feed-action">a complété</span>
                    <span class="feed-highlight">${entry.reps} ${sportObj.icon} ${sportObj.label}</span>
                    <span class="feed-time">${formatDate(ts)}</span>
                </div>
                ${entry.note ? `<div class="feed-note">"${escapeHtml(entry.note)}"</div>` : ""}
            </div>
        `;
        list.appendChild(li);
    });
}

/* ================================================================
   COMPETITION (real-time)
================================================================ */
function subscribeCompetition() {
    if (unsubCompetition) unsubCompetition();
    unsubCompetition = db.collection("settings").doc("competition")
        .onSnapshot(snap => {
            if (snap.exists && snap.data().active) {
                activeCompetition = snap.data();
                showCompetitionBanner(activeCompetition);
            } else {
                activeCompetition = null;
                hideCompetitionBanner();
            }
        }, err => { console.error("Competition snapshot error:", err); });
}

function showCompetitionBanner(comp) {
    const banner = document.getElementById("competition-banner");
    document.getElementById("comp-title").textContent = "🏆 " + (comp.name || "Concours en cours");
    document.getElementById("comp-sub").textContent   = comp.description || "Participez dès maintenant !";
    banner.classList.remove("hidden");
    startCompTimer(comp.endAt);
}

function hideCompetitionBanner() {
    document.getElementById("competition-banner").classList.add("hidden");
    if (compTimerInterval) { clearInterval(compTimerInterval); compTimerInterval = null; }
}

function startCompTimer(endAtTimestamp) {
    if (compTimerInterval) clearInterval(compTimerInterval);
    if (!endAtTimestamp) { document.getElementById("comp-timer").textContent = ""; return; }

    function tick() {
        const now     = Date.now();
        const endMs   = endAtTimestamp.toMillis ? endAtTimestamp.toMillis() : new Date(endAtTimestamp).getTime();
        const diffMs  = endMs - now;
        if (diffMs <= 0) {
            document.getElementById("comp-timer").textContent = "Terminé";
            clearInterval(compTimerInterval);
            return;
        }
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);
        document.getElementById("comp-timer").textContent =
            String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }
    tick();
    compTimerInterval = setInterval(tick, 1000);
}

/* ================================================================
   ADMIN: load stats
================================================================ */
async function loadAdminStats() {
    if (!isAdmin) return;
    try {
        // User count
        const usersSnap = await db.collection("users").get();
        document.getElementById("admin-stat-users").textContent = usersSnap.size;

        // Total reps across all users
        let total = 0;
        usersSnap.forEach(doc => { total += doc.data().totalReps || 0; });
        document.getElementById("admin-stat-total").textContent = total;

        // Workouts today
        const todaySnap = await db.collection("workouts")
            .where("dateStr", "==", todayDateStr())
            .get();
        document.getElementById("admin-stat-today").textContent = todaySnap.size;

    } catch (err) {
        console.error("loadAdminStats error:", err);
    }
}

/* ================================================================
   MODAL HELPERS
================================================================ */
function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
}

// Close modal on overlay click
document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", e => {
        if (e.target === overlay) overlay.classList.add("hidden");
    });
});

/* ================================================================
   ADMIN ACTIONS (called from HTML)
================================================================ */

async function adminResetScores() {
    const confirm = document.getElementById("reset-confirm-input").value.trim();
    if (confirm !== "RESET") {
        showToast("⚠️ Tapez RESET pour confirmer.", "error");
        return;
    }
    if (!adminPanel) return;
    try {
        await adminPanel.resetScores(currentSport);
        closeModal("modal-reset");
        document.getElementById("reset-confirm-input").value = "";
        showToast("✅ Tous les scores ont été réinitialisés.", "success");
        await loadDashboard();
        await loadAdminStats();
    } catch (err) {
        console.error("adminResetScores error:", err);
        showToast("❌ Erreur lors de la réinitialisation.", "error");
    }
}

async function adminStartCompetition() {
    const name     = document.getElementById("comp-name-input").value.trim();
    const startStr = document.getElementById("comp-start-input").value;
    const duration = parseInt(document.getElementById("comp-duration-input").value, 10);
    const desc     = document.getElementById("comp-desc-input").value.trim();

    if (!name || !startStr || !duration) {
        showToast("⚠️ Remplissez tous les champs obligatoires.", "error");
        return;
    }

    if (!adminPanel) return;
    try {
        await adminPanel.startNewCompetition({ name, startStr, duration, desc });
        closeModal("modal-competition");
        showToast("🏆 Concours lancé avec succès !", "success");
    } catch (err) {
        console.error("adminStartCompetition error:", err);
        showToast("❌ Erreur lors du lancement du concours.", "error");
    }
}

async function adminChangeSport() {
    const select     = document.getElementById("sport-select");
    const sportKey   = select.value;
    let   customName = "";
    if (sportKey === "custom") {
        customName = document.getElementById("custom-sport-name").value.trim();
        if (!customName) { showToast("⚠️ Entrez le nom du sport.", "error"); return; }
    }
    if (!adminPanel) return;
    try {
        await adminPanel.changeSport(sportKey, customName);
        closeModal("modal-sport");
        updateSportUI(sportKey, customName || null);
        showToast(`✅ Sport changé en ${customName || SPORTS[sportKey].label}.`, "success");
    } catch (err) {
        console.error("adminChangeSport error:", err);
        showToast("❌ Erreur lors du changement de sport.", "error");
    }
}

async function adminOpenUsers() {
    if (!adminPanel) return;
    await adminPanel.loadUsers(document.getElementById("users-table-body"), currentUser.uid);
}

// Override to load users when modal opens
const _origOpen = openModal;
window.openModal = function(id) {
    _origOpen(id);
    if (id === "modal-users" && adminPanel) adminOpenUsers();
};

/* ================================================================
   TOAST NOTIFICATIONS
================================================================ */
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast     = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons     = { success: "✅", error: "❌", info: "ℹ️" };
    toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity   = "0";
        toast.style.transform = "translateX(20px)";
        toast.style.transition = "opacity 0.3s, transform 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ================================================================
   UTILITY HELPERS
================================================================ */
function todayDateStr() {
    return new Date().toISOString().slice(0, 10);
}

function last7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }
    return days;
}

function formatDate(date) {
    const now  = new Date();
    const diff = now - date;
    if (diff < 60000)      return "À l'instant";
    if (diff < 3600000)    return Math.floor(diff / 60000) + " min";
    if (diff < 86400000)   return Math.floor(diff / 3600000) + " h";
    if (diff < 604800000)  return Math.floor(diff / 86400000) + " j";
    return date.toLocaleDateString("fr-FR");
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g,  "&amp;")
        .replace(/</g,  "&lt;")
        .replace(/>/g,  "&gt;")
        .replace(/"/g,  "&quot;")
        .replace(/'/g,  "&#39;");
}

// Expose functions called from HTML inline handlers
window.switchAuthTab      = switchAuthTab;
window.handleLogin        = handleLogin;
window.handleRegister     = handleRegister;
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleLogout       = handleLogout;
window.showTab            = showTab;
window.changeReps         = changeReps;
window.submitWorkout      = submitWorkout;
window.openModal          = openModal;
window.closeModal         = closeModal;
window.adminResetScores   = adminResetScores;
window.adminStartCompetition = adminStartCompetition;
window.adminChangeSport   = adminChangeSport;
