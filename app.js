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

const MAX_STREAK_DAYS = 365; // look-back limit for streak calculation
const MS_PER_HOUR     = 3600000;
const MS_PER_MINUTE   = 60000;
const MS_PER_SECOND   = 1000;

let currentUser = null;
let isAdmin = false;
let currentSport = "sit-ups";
let adminPanel = null;

// Listeners
let unsubLeaderboard = null;
let unsubFeed = null;
let unsubMySessions = null;
let unsubCompetition = null;
let compTimerInterval = null;

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
        // admin-badge uses "hidden"; admin-tab-btn uses "admin-only" — remove the right class
        document.getElementById("admin-badge").classList.remove("hidden");
        document.getElementById("admin-tab-btn").classList.remove("admin-only");
        adminPanel = new AdminPanel(db, auth, ADMIN_EMAIL, showToast, updateSportUI, loadAdminStats);
    }

    const name = currentUser.displayName || currentUser.email;
    document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();

    await loadPlatformSettings();
    subscribeLeaderboard();
    subscribeFeed();
    subscribeMySessionsList();
    subscribeCompetition();
    await loadDashboard();
    showTab("dashboard");
}

function onUserSignedOut() {
    if (unsubLeaderboard)  { unsubLeaderboard();  unsubLeaderboard  = null; }
    if (unsubFeed)         { unsubFeed();          unsubFeed         = null; }
    if (unsubMySessions)   { unsubMySessions();    unsubMySessions   = null; }
    if (unsubCompetition)  { unsubCompetition();   unsubCompetition  = null; }
    if (compTimerInterval) { clearInterval(compTimerInterval); compTimerInterval = null; }
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
    document.getElementById("lb-sport-name").textContent  = sport.label;
    document.getElementById("stat-sport-label").textContent = sport.label;
}

function showTab(tabName) {
    // Non-admins cannot access the admin tab
    if (tabName === "admin" && !isAdmin) return;
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    document.getElementById("tab-" + tabName).classList.remove("hidden");
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    if (tabName === "admin") loadAdminStats();
}

async function loadDashboard() {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch personal workouts, user doc and all users in parallel
    const [myWorkoutsSnap, userDoc, allUsersSnap] = await Promise.all([
        db.collection("workouts").where("userId", "==", currentUser.uid).get(),
        db.collection("users").doc(currentUser.uid).get(),
        db.collection("users").orderBy("totalReps", "desc").get()
    ]);

    // Group reps by date
    const byDate = {};
    myWorkoutsSnap.forEach(doc => {
        const d = doc.data();
        byDate[d.dateStr] = (byDate[d.dateStr] || 0) + d.reps;
    });

    // Total reps from user document
    const myTotalReps = userDoc.exists ? (userDoc.data().totalReps || 0) : 0;
    document.getElementById("stat-total").textContent = myTotalReps;

    // Today's reps
    document.getElementById("stat-today").textContent = byDate[today] || 0;

    // Streak (consecutive days with at least one workout)
    let streak = 0;
    const startOffset = byDate[today] ? 0 : 1;
    for (let i = startOffset; i < MAX_STREAK_DAYS; i++) {
        const dd = new Date();
        dd.setDate(dd.getDate() - i);
        const ds = dd.toISOString().slice(0, 10);
        if (byDate[ds]) {
            streak++;
        } else {
            break;
        }
    }
    document.getElementById("stat-streak").textContent = streak;

    // Best day
    const bestDay = Object.values(byDate).reduce((a, b) => Math.max(a, b), 0);
    document.getElementById("stat-best").textContent = bestDay;

    // Weekly chart (last 7 days)
    const chartEl = document.getElementById("weekly-chart");
    chartEl.innerHTML = "";
    const dayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
        const dd = new Date();
        dd.setDate(dd.getDate() - i);
        last7.push({ label: dayLabels[dd.getDay()], reps: byDate[dd.toISOString().slice(0, 10)] || 0 });
    }
    const maxReps = last7.reduce((a, b) => Math.max(a, b.reps), 1);
    last7.forEach(bar => {
        const wrap = document.createElement("div");
        wrap.className = "chart-bar-wrap";
        const b = document.createElement("div");
        b.className = "chart-bar";
        b.style.height = Math.max(4, Math.round((bar.reps / maxReps) * 100)) + "px";
        b.title = bar.reps + " reps";
        const lbl = document.createElement("div");
        lbl.className = "chart-bar-label";
        lbl.textContent = bar.label;
        wrap.appendChild(b);
        wrap.appendChild(lbl);
        chartEl.appendChild(wrap);
    });

    // Personal rank
    let rank = 0;
    let totalUsers = 0;
    allUsersSnap.forEach(doc => {
        totalUsers++;
        if (doc.id === currentUser.uid) rank = totalUsers;
    });
    const rankEl = document.getElementById("my-rank-info");
    if (rank > 0) {
        rankEl.textContent = "Position " + rank + " sur " + totalUsers + " participant" + (totalUsers > 1 ? "s" : "") + " – " + myTotalReps + " reps au total";
    } else {
        rankEl.textContent = "Vous n'êtes pas encore dans le classement. Enregistrez une séance !";
    }
}

async function submitWorkout() {
    const repsInput = document.getElementById("reps-input");
    const reps = parseInt(repsInput.value);
    if (isNaN(reps) || reps < 1) { showToast("Entrez un nombre de reps valide", "error"); return; }

    const note = document.getElementById("log-note").value.trim();
    const btn  = document.getElementById("log-submit-btn");
    btn.disabled = true;
    try {
        await db.collection("workouts").add({
            userId:      currentUser.uid,
            displayName: currentUser.displayName || currentUser.email,
            sport:       currentSport,
            reps:        reps,
            note:        note,
            timestamp:   firebase.firestore.FieldValue.serverTimestamp(),
            dateStr:     new Date().toISOString().slice(0, 10)
        });

        await db.collection("users").doc(currentUser.uid).set({
            displayName: currentUser.displayName || currentUser.email,
            email:       currentUser.email,
            totalReps:   firebase.firestore.FieldValue.increment(reps)
        }, { merge: true });

        showToast("Séance enregistrée !", "success");
        repsInput.value = "10";
        document.getElementById("log-note").value = "";
        loadDashboard();
    } catch (err) {
        showToast("Erreur lors de l'enregistrement", "error");
        console.error("submitWorkout error:", err);
    } finally {
        btn.disabled = false;
    }
}

function subscribeLeaderboard() {
    unsubLeaderboard = db.collection("users").orderBy("totalReps", "desc").limit(10)
        .onSnapshot(snap => {
            const list = document.getElementById("leaderboard-list");
            list.innerHTML = "";
            let i = 0;
            snap.forEach(doc => {
                const u     = doc.data();
                const sport = SPORTS[currentSport] || SPORTS["sit-ups"];
                const li    = document.createElement("li");
                li.className = "leaderboard-item" + (i < 3 ? " rank-" + (i + 1) : "");

                const badge = document.createElement("div");
                badge.className = "rank-badge";
                badge.textContent = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1);

                const info = document.createElement("div");
                info.className = "leaderboard-info";

                const nameEl = document.createElement("div");
                nameEl.className = "leaderboard-name";
                nameEl.textContent = u.displayName || "–";
                info.appendChild(nameEl);

                const scoreEl = document.createElement("div");
                scoreEl.className = "leaderboard-score";
                scoreEl.textContent = (u.totalReps || 0) + " " + sport.unit;

                li.appendChild(badge);
                li.appendChild(info);
                li.appendChild(scoreEl);
                list.appendChild(li);
                i++;
            });
        }, err => {
            console.error("Leaderboard listener error:", err);
        });
}

function subscribeFeed() {
    unsubFeed = db.collection("workouts").orderBy("timestamp", "desc").limit(10)
        .onSnapshot(snap => {
            const list = document.getElementById("community-feed");
            list.innerHTML = "";
            if (snap.empty) {
                const li = document.createElement("li");
                li.style.cssText = "color:var(--text-muted);font-size:0.9rem;";
                li.textContent = "Aucune activité récente.";
                list.appendChild(li);
                return;
            }
            snap.forEach(doc => {
                const d     = doc.data();
                const sport = SPORTS[d.sport] || SPORTS["sit-ups"];
                const name  = d.displayName || "?";

                const li = document.createElement("li");
                li.className = "feed-item";

                const avatar = document.createElement("div");
                avatar.className = "feed-avatar";
                avatar.textContent = name.charAt(0).toUpperCase();

                const content = document.createElement("div");
                content.className = "feed-content";

                const header = document.createElement("div");
                header.className = "feed-header";

                const nameEl = document.createElement("span");
                nameEl.className = "feed-name";
                nameEl.textContent = name;

                const actionEl = document.createElement("span");
                actionEl.className = "feed-action";
                actionEl.textContent = " a fait ";

                const highlight = document.createElement("span");
                highlight.className = "feed-highlight";
                highlight.textContent = d.reps + " " + sport.unit;
                actionEl.appendChild(highlight);

                const sportLbl = document.createElement("span");
                sportLbl.textContent = " de " + sport.label;
                actionEl.appendChild(sportLbl);

                const timeEl = document.createElement("span");
                timeEl.className = "feed-time";
                if (d.timestamp) {
                    const ts = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                    timeEl.textContent = formatTimeAgo(ts);
                }

                header.appendChild(nameEl);
                header.appendChild(actionEl);
                header.appendChild(timeEl);
                content.appendChild(header);

                if (d.note) {
                    const noteEl = document.createElement("div");
                    noteEl.className = "feed-note";
                    noteEl.textContent = '"' + d.note + '"';
                    content.appendChild(noteEl);
                }

                li.appendChild(avatar);
                li.appendChild(content);
                list.appendChild(li);
            });
        }, err => {
            console.error("Feed listener error:", err);
        });
}

function subscribeMySessionsList() {
    unsubMySessions = db.collection("workouts")
        .where("userId", "==", currentUser.uid)
        .orderBy("timestamp", "desc")
        .limit(10)
        .onSnapshot(snap => {
            const list = document.getElementById("my-sessions-list");
            list.innerHTML = "";
            if (snap.empty) {
                const li = document.createElement("li");
                li.style.cssText = "color:var(--text-muted);font-size:0.9rem;";
                li.textContent = "Aucune séance enregistrée.";
                list.appendChild(li);
                return;
            }
            snap.forEach(doc => {
                const d     = doc.data();
                const sport = SPORTS[d.sport] || SPORTS["sit-ups"];

                const li = document.createElement("li");
                li.className = "feed-item";

                const avatar = document.createElement("div");
                avatar.className = "feed-avatar";
                avatar.textContent = sport.icon;

                const content = document.createElement("div");
                content.className = "feed-content";

                const header = document.createElement("div");
                header.className = "feed-header";

                const repsEl = document.createElement("span");
                repsEl.className = "feed-name";
                repsEl.textContent = d.reps + " " + sport.unit;

                const sportEl = document.createElement("span");
                sportEl.className = "feed-action";
                sportEl.textContent = " – " + sport.label;

                const timeEl = document.createElement("span");
                timeEl.className = "feed-time";
                if (d.timestamp) {
                    const ts = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                    timeEl.textContent = formatTimeAgo(ts);
                }

                header.appendChild(repsEl);
                header.appendChild(sportEl);
                header.appendChild(timeEl);
                content.appendChild(header);

                if (d.note) {
                    const noteEl = document.createElement("div");
                    noteEl.className = "feed-note";
                    noteEl.textContent = '"' + d.note + '"';
                    content.appendChild(noteEl);
                }

                li.appendChild(avatar);
                li.appendChild(content);
                list.appendChild(li);
            });
        }, err => {
            console.error("My sessions listener error:", err);
        });
}

function subscribeCompetition() {
    unsubCompetition = db.collection("settings").doc("competition")
        .onSnapshot(snap => {
            if (compTimerInterval) { clearInterval(compTimerInterval); compTimerInterval = null; }
            const banner = document.getElementById("competition-banner");

            if (!snap.exists || !snap.data().active) {
                banner.classList.add("hidden");
                return;
            }

            const comp    = snap.data();
            const endDate = comp.endDate && comp.endDate.toDate ? comp.endDate.toDate() : new Date(comp.endDate);

            if (endDate <= new Date()) {
                banner.classList.add("hidden");
                return;
            }

            banner.classList.remove("hidden");
            document.getElementById("comp-title").textContent = "🏆 " + comp.name;
            document.getElementById("comp-sub").textContent   = comp.description || "Participez dès maintenant !";

            function updateTimer() {
                const diff = endDate - new Date();
                if (diff <= 0) {
                    document.getElementById("comp-timer").textContent = "Terminé";
                    clearInterval(compTimerInterval);
                    compTimerInterval = null;
                    return;
                }
                const h = Math.floor(diff / MS_PER_HOUR);
                const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE);
                const s = Math.floor((diff % MS_PER_MINUTE) / MS_PER_SECOND);
                document.getElementById("comp-timer").textContent =
                    String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
            }
            updateTimer();
            compTimerInterval = setInterval(updateTimer, 1000);
        }, err => {
            console.error("Competition listener error:", err);
        });
}

async function loadAdminStats() {
    const today = new Date().toISOString().slice(0, 10);
    try {
        const [usersSnap, todaySnap] = await Promise.all([
            db.collection("users").get(),
            db.collection("workouts").where("dateStr", "==", today).get()
        ]);
        document.getElementById("admin-stat-users").textContent = usersSnap.size;
        let totalReps = 0;
        usersSnap.forEach(doc => { totalReps += (doc.data().totalReps || 0); });
        document.getElementById("admin-stat-total").textContent = totalReps;
        document.getElementById("admin-stat-today").textContent = todaySnap.size;
    } catch (err) {
        console.error("loadAdminStats error:", err);
    }
}

function formatTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "à l'instant";
    if (m < 60) return "il y a " + m + "min";
    const h = Math.floor(m / 60);
    if (h < 24) return "il y a " + h + "h";
    const d = Math.floor(h / 24);
    return "il y a " + d + "j";
}

function showToast(m, t) {
    const toast = document.createElement("div");
    toast.className = "toast " + t;
    toast.textContent = m;
    document.getElementById("toast-container").appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Global functions for HTML ──────────────────────────────────────────────────
window.switchAuthTab = (t) => {
    document.getElementById("login-form").classList.toggle("hidden", t !== "login");
    document.getElementById("register-form").classList.toggle("hidden", t !== "register");
    document.querySelectorAll(".auth-tab").forEach(btn => btn.classList.remove("active"));
    document.getElementById("tab-" + t).classList.add("active");
};

window.handleLogin = async (e) => {
    e.preventDefault();
    const email    = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const errEl    = document.getElementById("auth-error");
    const btn      = document.getElementById("login-btn");
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
    const name     = document.getElementById("reg-name").value.trim();
    const email    = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const errEl    = document.getElementById("auth-error");
    const btn      = document.getElementById("register-btn");
    errEl.classList.add("hidden");
    btn.disabled = true;
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        await db.collection("users").doc(cred.user.uid).set({
            displayName: name,
            email:       email,
            totalReps:   0,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
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
    const errEl    = document.getElementById("auth-error");
    errEl.classList.add("hidden");
    try {
        const cred    = await auth.signInWithPopup(provider);
        const user    = cred.user;
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (!userDoc.exists) {
            await db.collection("users").doc(user.uid).set({
                displayName: user.displayName || user.email,
                email:       user.email,
                totalReps:   0,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
    }
};

window.handleLogout = () => auth.signOut();
window.showTab       = showTab;
window.submitWorkout = submitWorkout;

window.changeReps = (v) => {
    const i = document.getElementById("reps-input");
    const current = parseInt(i.value) || 0;
    i.value = Math.max(1, current + v);
};

window.openModal = (id) => {
    if (id === "modal-users" && adminPanel) {
        adminPanel.loadUsers(
            document.getElementById("users-table-body"),
            currentUser.uid,
            ADMIN_EMAIL
        );
    }
    document.getElementById(id).classList.remove("hidden");
};

window.closeModal = (id) => {
    document.getElementById(id).classList.add("hidden");
};

window.adminResetScores = async () => {
    const input = document.getElementById("reset-confirm-input").value.trim();
    if (input !== "RESET") { showToast("Tapez RESET pour confirmer", "error"); return; }
    await adminPanel.resetScores();
    closeModal("modal-reset");
    document.getElementById("reset-confirm-input").value = "";
    loadAdminStats();
    loadDashboard();
};

window.adminStartCompetition = async () => {
    const name     = document.getElementById("comp-name-input").value.trim();
    const start    = document.getElementById("comp-start-input").value;
    const duration = parseInt(document.getElementById("comp-duration-input").value);
    const desc     = document.getElementById("comp-desc-input").value.trim();
    if (!name || !start || isNaN(duration) || duration < 1) {
        showToast("Veuillez remplir tous les champs obligatoires", "error");
        return;
    }
    const startDate = new Date(start);
    const endDate   = new Date(startDate.getTime() + duration * 86400000);
    await db.collection("settings").doc("competition").set({
        name,
        description: desc,
        startDate:   firebase.firestore.Timestamp.fromDate(startDate),
        endDate:     firebase.firestore.Timestamp.fromDate(endDate),
        active:      true
    });
    showToast("Concours lancé !", "success");
    closeModal("modal-competition");
    document.getElementById("comp-name-input").value     = "";
    document.getElementById("comp-start-input").value    = "";
    document.getElementById("comp-duration-input").value = "7";
    document.getElementById("comp-desc-input").value     = "";
};

window.adminChangeSport = async () => {
    const sportKey   = document.getElementById("sport-select").value;
    const customName = sportKey === "custom"
        ? document.getElementById("custom-sport-name").value.trim()
        : "";
    if (sportKey === "custom" && !customName) {
        showToast("Entrez un nom pour le sport personnalisé", "error");
        return;
    }
    await adminPanel.changeSport(sportKey, customName);
    closeModal("modal-sport");
};

const sportSelect = document.getElementById("sport-select");
if (sportSelect) {
    sportSelect.addEventListener("change", (e) => {
        document.getElementById("custom-sport-group").classList.toggle("hidden", e.target.value !== "custom");
    });
}
