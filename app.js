// app.js – Main application logic
const SPORTS = {
    "sit-ups":  { label: "Sit-ups",    icon: "🧘", unit: "redressements" },
    "push-ups": { label: "Push-ups",   icon: "💪", unit: "pompes" },
    "squats":   { label: "Squats",     icon: "🦵", unit: "squats" },
    "pull-ups": { label: "Pull-ups",   icon: "🏋️", unit: "tractions" },
    "burpees":  { label: "Burpees",    icon: "🔥", unit: "burpees" },
    "running":  { label: "Course",     icon: "🏃", unit: "km"   },
    "custom":   { label: "Sport",      icon: "⭐", unit: "répetitions" }
};

const MAX_STREAK_DAYS    = 365; // look-back limit for streak calculation
const MAX_MESSAGES       = 50;  // maximum messages loaded in the chat
const MAX_MESSAGE_LENGTH = 300; // character limit for chat messages

const EMOJI_LIST = [
    "😀","😂","😍","🤩","😎","🥳","😅","🤔","😮","😢",
    "👍","👎","❤️","🔥","💪","🎉","🏆","⚡","🙏","👏",
    "😡","🤣","😊","😏","🥴","🤦","🙈","💀","✅","❌"
];

let currentUser = null;
let isAdmin = false;
let currentSport = "sit-ups";
let adminPanel = null;

// Listeners
let unsubLeaderboard = null;
let unsubFeed = null;
let unsubMySessions = null;
let unsubCompetition = null;
let unsubMessages = null;
let compTimerInterval = null;
let activeEmojiPicker = null;

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
    subscribeMessages();
    await loadDashboard();
    showTab("dashboard");
}

function onUserSignedOut() {
    if (unsubLeaderboard)  { unsubLeaderboard();  unsubLeaderboard  = null; }
    if (unsubFeed)         { unsubFeed();          unsubFeed         = null; }
    if (unsubMySessions)   { unsubMySessions();    unsubMySessions   = null; }
    if (unsubCompetition)  { unsubCompetition();   unsubCompetition  = null; }
    if (unsubMessages)     { unsubMessages();      unsubMessages     = null; }
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
            const rawEnd  = comp.endDate;
            let endDate;
            if (rawEnd && typeof rawEnd.toDate === "function") {
                endDate = rawEnd.toDate();
            } else if (rawEnd && typeof rawEnd.seconds === "number") {
                endDate = new Date(rawEnd.seconds * 1000 + Math.floor((rawEnd.nanoseconds || 0) / 1e6));
            } else {
                endDate = new Date(rawEnd);
            }

            if (!endDate || isNaN(endDate.getTime()) || endDate <= new Date()) {
                banner.classList.add("hidden");
                return;
            }

            banner.classList.remove("hidden");
            document.getElementById("comp-title").textContent = "🏆 " + comp.name;
            document.getElementById("comp-sub").textContent   = comp.description || "Participez dès maintenant !";

            function updateTimer() {
                const diff = endDate.getTime() - Date.now();
                if (diff <= 0) {
                    document.getElementById("comp-timer").textContent = "Terminé";
                    if (compTimerInterval) { clearInterval(compTimerInterval); compTimerInterval = null; }
                    return;
                }
                const totalSec = Math.floor(diff / 1000);
                const d = Math.floor(totalSec / 86400);
                const h = Math.floor((totalSec % 86400) / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                const s = totalSec % 60;
                const hh = String(h).padStart(2, "0");
                const mm = String(m).padStart(2, "0");
                const ss = String(s).padStart(2, "0");
                document.getElementById("comp-timer").textContent =
                    d > 0 ? d + "j " + hh + ":" + mm + ":" + ss : hh + ":" + mm + ":" + ss;
            }
            updateTimer();
            if (endDate > new Date()) {
                compTimerInterval = setInterval(updateTimer, 1000);
            }
        }, err => {
            console.error("Competition listener error:", err);
        });
}

// Track which message is being edited so we can restore the state after a re-render
let editingDocId   = null;
let editingDraftText = null;

function subscribeMessages() {
    unsubMessages = db.collection("messages").orderBy("timestamp", "asc").limit(MAX_MESSAGES)
        .onSnapshot(snap => {
            const list = document.getElementById("messages-list");

            // Preserve scroll position intent: only auto-scroll when already near the bottom
            const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 100;

            // Preserve any in-progress edit draft before clearing the DOM
            const activeInput = list.querySelector(".message-edit-input");
            if (activeInput) {
                editingDraftText = activeInput.value;
            }

            list.innerHTML = "";
            if (snap.empty) {
                const li = document.createElement("li");
                li.style.cssText = "color:var(--text-muted);font-size:0.9rem;";
                li.textContent = "Aucun message.";
                list.appendChild(li);
                return;
            }
            snap.forEach(doc => {
                const d         = doc.data();
                const name      = d.displayName || "?";
                const isOwn     = d.userId === currentUser.uid;
                const canModify = isOwn || isAdmin;

                const li = document.createElement("li");
                li.className = "message-item" + (isOwn ? " message-own" : "");

                const avatar = document.createElement("div");
                avatar.className = "feed-avatar";
                avatar.textContent = name.charAt(0).toUpperCase();

                const content = document.createElement("div");
                content.className = "message-content";

                const header = document.createElement("div");
                header.className = "message-header";

                const nameEl = document.createElement("span");
                nameEl.className = "feed-name";
                nameEl.textContent = name;

                const timeEl = document.createElement("span");
                timeEl.className = "feed-time";
                // Use serverTimestamp if available, otherwise fall back to clientTimestamp
                const tsSource = d.timestamp || (d.clientTimestamp ? new Date(d.clientTimestamp) : null);
                if (tsSource) {
                    const ts = tsSource.toDate ? tsSource.toDate() : new Date(tsSource);
                    timeEl.textContent = formatTimeAgo(ts);
                }

                header.appendChild(nameEl);
                header.appendChild(timeEl);

                const textEl = document.createElement("div");
                textEl.className = "message-text";
                textEl.textContent = d.text;
                if (d.editedAt) {
                    const editedSpan = document.createElement("span");
                    editedSpan.className = "message-edited";
                    editedSpan.textContent = " (modifié)";
                    const editedTs = d.editedAt.toDate ? d.editedAt.toDate() : new Date(d.editedAt);
                    editedSpan.title = "Modifié le " + editedTs.toLocaleString("fr-FR");
                    editedSpan.setAttribute("aria-label", "Message modifié");
                    textEl.appendChild(editedSpan);
                }

                // Reactions row
                const reactionsEl = document.createElement("div");
                reactionsEl.className = "message-reactions";
                if (d.reactions) {
                    Object.entries(d.reactions).forEach(([emoji, uids]) => {
                        if (!Array.isArray(uids) || uids.length === 0) return;
                        const reacted = uids.includes(currentUser.uid);
                        const btn = document.createElement("button");
                        btn.className = "reaction-btn" + (reacted ? " reaction-own" : "");
                        btn.textContent = emoji + " " + uids.length;
                        btn.title = reacted ? "Retirer la réaction" : "Réagir";
                        btn.setAttribute("aria-label", emoji + " " + uids.length + (reacted ? " – retirer" : " – réagir"));
                        btn.onclick = () => toggleReaction(doc.id, emoji);
                        reactionsEl.appendChild(btn);
                    });
                }

                // Action buttons row
                const actionsEl = document.createElement("div");
                actionsEl.className = "message-actions";
                actionsEl.setAttribute("aria-label", "Actions du message");

                const emojiBtn = document.createElement("button");
                emojiBtn.className = "msg-action-btn";
                emojiBtn.title = "Réagir avec un emoji";
                emojiBtn.setAttribute("aria-label", "Réagir avec un emoji");
                emojiBtn.textContent = "😊";
                emojiBtn.onclick = (e) => showEmojiPicker(e, doc.id, emojiBtn);
                actionsEl.appendChild(emojiBtn);

                if (canModify) {
                    const editBtn = document.createElement("button");
                    editBtn.className = "msg-action-btn";
                    editBtn.title = "Modifier";
                    editBtn.setAttribute("aria-label", "Modifier le message");
                    editBtn.textContent = "✏️";
                    editBtn.onclick = () => startEditMessage(li, doc.id, d.text, textEl);
                    actionsEl.appendChild(editBtn);

                    const delBtn = document.createElement("button");
                    delBtn.className = "msg-action-btn";
                    delBtn.title = "Supprimer";
                    delBtn.setAttribute("aria-label", "Supprimer le message");
                    delBtn.textContent = "🗑️";
                    delBtn.onclick = () => deleteMessage(doc.id);
                    actionsEl.appendChild(delBtn);
                }

                content.appendChild(header);
                content.appendChild(textEl);
                content.appendChild(reactionsEl);
                content.appendChild(actionsEl);

                if (isOwn) {
                    li.appendChild(content);
                    li.appendChild(avatar);
                } else {
                    li.appendChild(avatar);
                    li.appendChild(content);
                }
                list.appendChild(li);

                // Restore inline edit if this message was being edited before re-render
                if (editingDocId === doc.id) {
                    startEditMessage(li, doc.id, editingDraftText !== null ? editingDraftText : d.text, textEl);
                    editingDraftText = null;
                }
            });

            if (nearBottom) list.scrollTop = list.scrollHeight;
        }, err => {
            console.error("Messages listener error:", err);
            showToast("Erreur de chargement des messages", "error");
        });
}

// ── Emoji picker ──────────────────────────────────────────────────────────────
function showEmojiPicker(event, docId, anchorBtn) {
    event.stopPropagation();
    if (activeEmojiPicker) {
        const isSameBtn = activeEmojiPicker._anchorBtn === anchorBtn;
        // Always clean up the existing picker and its listener
        if (activeEmojiPicker._closeListener) {
            document.removeEventListener("click", activeEmojiPicker._closeListener);
        }
        activeEmojiPicker.remove();
        activeEmojiPicker = null;
        if (isSameBtn) return; // toggle: same button closes the picker
    }

    const picker = document.createElement("div");
    picker.className = "emoji-picker";
    picker._anchorBtn = anchorBtn;
    EMOJI_LIST.forEach(emoji => {
        const btn = document.createElement("button");
        btn.className = "emoji-option";
        btn.textContent = emoji;
        btn.onclick = (e) => {
            e.stopPropagation();
            toggleReaction(docId, emoji);
            if (activeEmojiPicker && activeEmojiPicker._closeListener) {
                document.removeEventListener("click", activeEmojiPicker._closeListener);
            }
            picker.remove();
            activeEmojiPicker = null;
        };
        picker.appendChild(btn);
    });

    document.body.appendChild(picker);
    activeEmojiPicker = picker;

    const rect        = anchorBtn.getBoundingClientRect();
    const pickerWidth = picker.offsetWidth || 250;
    picker.style.top  = (rect.bottom + 6) + "px";
    picker.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pickerWidth - 8)) + "px";

    const closePicker = () => {
        picker.remove();
        activeEmojiPicker = null;
        document.removeEventListener("click", closePicker);
    };
    picker._closeListener = closePicker;
    setTimeout(() => document.addEventListener("click", closePicker), 0);
}

async function toggleReaction(docId, emoji) {
    try {
        const docRef = db.collection("messages").doc(docId);
        const snap   = await docRef.get();
        if (!snap.exists) return;
        const uid  = currentUser.uid;
        const uids = ((snap.data().reactions || {})[emoji]) || [];
        const op   = uids.includes(uid)
            ? firebase.firestore.FieldValue.arrayRemove(uid)
            : firebase.firestore.FieldValue.arrayUnion(uid);
        await docRef.update({ [`reactions.${emoji}`]: op });
    } catch (err) {
        console.error("toggleReaction error:", err);
        showToast("Erreur lors de la réaction", "error");
    }
}

function startEditMessage(li, docId, currentText, textEl) {
    if (li.querySelector(".message-edit-input")) return; // already editing

    editingDocId = docId;

    const editInput = document.createElement("input");
    editInput.className = "form-control message-edit-input";
    editInput.value = currentText;
    editInput.maxLength = MAX_MESSAGE_LENGTH;

    const editActions = document.createElement("div");
    editActions.className = "message-edit-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary btn-sm";
    saveBtn.textContent = "Sauvegarder";
    saveBtn.onclick = async () => {
        const newText = editInput.value.trim();
        if (!newText) return;
        saveBtn.disabled = true;
        const ok = await saveMessageEdit(docId, newText);
        if (!ok) saveBtn.disabled = false;
        // On success the snapshot re-render will clear editingDocId
    };

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-secondary btn-sm";
    cancelBtn.textContent = "Annuler";
    cancelBtn.onclick = () => {
        editingDocId   = null;
        editingDraftText = null;
        editInput.replaceWith(textEl);
        editActions.remove();
    };

    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);

    textEl.replaceWith(editInput);
    editInput.insertAdjacentElement("afterend", editActions);
    editInput.focus();
    editInput.select();
}

async function saveMessageEdit(docId, newText) {
    try {
        await db.collection("messages").doc(docId).update({
            text:     newText,
            editedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (err) {
        console.error("saveMessageEdit error:", err);
        showToast("Erreur lors de la modification", "error");
        return false;
    }
}

async function deleteMessage(docId) {
    if (!confirm("Supprimer ce message ?")) return;
    try {
        await db.collection("messages").doc(docId).delete();
    } catch (err) {
        console.error("deleteMessage error:", err);
        showToast("Erreur lors de la suppression", "error");
    }
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

window.sendMessage = async (e) => {
    e.preventDefault();
    const input = document.getElementById("message-input");
    const text  = input.value.trim();
    if (!text) return;
    input.value = "";
    const name = currentUser.displayName || currentUser.email;
    try {
        await db.collection("messages").add({
            userId:          currentUser.uid,
            displayName:     name,
            text:            text,
            timestamp:       firebase.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: Date.now()
        });
        input.focus();
    } catch (err) {
        console.error("sendMessage error:", err);
        input.value = text; // restore on error
        showToast("Erreur lors de l'envoi du message", "error");
    }
};

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

// ── User account menu ─────────────────────────────────────────────────────────
window.toggleUserMenu = () => {
    document.getElementById("user-menu").classList.toggle("hidden");
};

window.closeUserMenu = () => {
    document.getElementById("user-menu").classList.add("hidden");
};

document.addEventListener("click", (e) => {
    const wrapper = document.getElementById("user-menu-wrapper");
    if (wrapper && !wrapper.contains(e.target)) {
        const menu = document.getElementById("user-menu");
        if (menu) menu.classList.add("hidden");
    }
});

// ── Helper: batch-delete an array of Firestore doc references ─────────────────
async function deleteInBatches(docs) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

// ── Delete own account ────────────────────────────────────────────────────────
window.handleDeleteAccount = async () => {
    const confirmInput = document.getElementById("delete-account-confirm");
    if (confirmInput.value.trim() !== "SUPPRIMER") {
        showToast("Tapez SUPPRIMER pour confirmer", "error");
        return;
    }
    const uid = currentUser.uid;
    const btn = document.querySelector("#modal-delete-account .btn-danger");
    if (btn) btn.disabled = true;
    try {
        const [workoutsSnap, messagesSnap] = await Promise.all([
            db.collection("workouts").where("userId", "==", uid).get(),
            db.collection("messages").where("userId", "==", uid).get()
        ]);
        await deleteInBatches([...workoutsSnap.docs, ...messagesSnap.docs]);
        await db.collection("users").doc(uid).delete();
        await currentUser.delete();
        closeModal("modal-delete-account");
    } catch (err) {
        if (btn) btn.disabled = false;
        confirmInput.value = "";
        if (err.code === "auth/requires-recent-login") {
            showToast("Reconnectez-vous d'abord, puis réessayez.", "error");
            closeModal("modal-delete-account");
            auth.signOut();
        } else {
            console.error("deleteAccount error:", err);
            showToast("Erreur : " + err.message, "error");
        }
    }
};

// ── Admin: delete a user's data ───────────────────────────────────────────────
window.adminDeleteUser = async (uid, displayName, triggerBtn) => {
    if (!confirm(`Supprimer le compte de « ${displayName} » ?\nToutes ses données seront effacées. Cette action est irréversible.`)) return;
    if (triggerBtn) triggerBtn.disabled = true;
    try {
        const [workoutsSnap, messagesSnap] = await Promise.all([
            db.collection("workouts").where("userId", "==", uid).get(),
            db.collection("messages").where("userId", "==", uid).get()
        ]);
        await deleteInBatches([...workoutsSnap.docs, ...messagesSnap.docs]);
        await db.collection("users").doc(uid).delete();
        showToast(`Données de « ${displayName} » supprimées.`, "success");
        loadAdminStats();
        // Reload users list
        adminPanel.loadUsers(
            document.getElementById("users-table-body"),
            currentUser.uid,
            ADMIN_EMAIL
        );
    } catch (err) {
        if (triggerBtn) triggerBtn.disabled = false;
        console.error("adminDeleteUser error:", err);
        showToast("Erreur : " + err.message, "error");
    }
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
