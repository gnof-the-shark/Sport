// admin.js – AdminPanel class for Sport Tracker
// Depends on: firebase-config.js (db, firebase global)

class AdminPanel {
    /**
     * @param {firebase.firestore.Firestore} db        - Firestore instance
     * @param {firebase.auth.Auth}           auth       - Firebase Auth instance
     * @param {string}                       adminEmail - The designated admin email
     * @param {Function}                     showToast  - Toast notification helper
     * @param {Function}                     updateSportUI - Callback to update sport UI
     * @param {Function}                     loadAdminStats - Callback to reload admin stats
     */
    constructor(db, auth, adminEmail, showToast, updateSportUI, loadAdminStats) {
        this.db            = db;
        this.auth          = auth;
        this.adminEmail    = adminEmail;
        this.showToast     = showToast;
        this.updateSportUI = updateSportUI;
        this.loadAdminStats = loadAdminStats;
    }

    /**
     * Reset all users' totalReps to 0 and delete all workout documents
     * for the given sport.
     * @param {string} sport - The sport key to reset (e.g. "sit-ups")
     */
    async resetScores(sport) {
        const db = this.db;

        // 1. Delete all workout documents (batch delete in chunks of 500)
        let query = db.collection("workouts").limit(500);
        let deleted = 0;
        let snap;
        do {
            snap = await query.get();
            if (snap.empty) break;
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            deleted += snap.size;
        } while (snap.size === 500);

        // 2. Reset totalReps for all users
        const usersSnap = await db.collection("users").get();
        const userBatch = db.batch();
        usersSnap.forEach(doc => {
            userBatch.update(doc.ref, { totalReps: 0 });
        });
        await userBatch.commit();

        // 3. Mark competition as inactive (optional cleanup)
        await db.collection("settings").doc("competition").set({ active: false }, { merge: true });

        console.log(`AdminPanel.resetScores: deleted ${deleted} workouts, reset ${usersSnap.size} users.`);
    }

    /**
     * Start a new competition and persist it to Firestore.
     * @param {Object} options
     * @param {string} options.name      - Competition name
     * @param {string} options.startStr  - Start datetime string (datetime-local input value)
     * @param {number} options.duration  - Duration in days
     * @param {string} [options.desc]    - Optional description
     */
    async startNewCompetition({ name, startStr, duration, desc }) {
        const startDate = new Date(startStr);
        const endDate   = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration);

        await this.db.collection("settings").doc("competition").set({
            name:        name,
            description: desc || "",
            startAt:     firebase.firestore.Timestamp.fromDate(startDate),
            endAt:       firebase.firestore.Timestamp.fromDate(endDate),
            durationDays: duration,
            active:      true,
            createdBy:   this.auth.currentUser ? this.auth.currentUser.uid : null,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log(`AdminPanel.startNewCompetition: "${name}" launched, ends ${endDate.toISOString()}`);
    }

    /**
     * Change the platform's active sport and persist the setting.
     * @param {string} sportKey    - One of the SPORTS keys or "custom"
     * @param {string} [customName] - Label for a custom sport
     */
    async changeSport(sportKey, customName) {
        const payload = {
            currentSport:      sportKey,
            customSportName:   customName || null,
            updatedAt:         firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy:         this.auth.currentUser ? this.auth.currentUser.uid : null
        };
        await this.db.collection("settings").doc("platform").set(payload, { merge: true });
        console.log(`AdminPanel.changeSport: changed to "${customName || sportKey}"`);
    }

    /**
     * Load users into the management table.
     * @param {HTMLElement} tbody      - The <tbody> element to populate
     * @param {string}      currentUid - The current admin's UID (to prevent self-removal)
     */
    async loadUsers(tbody, currentUid) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:var(--text-muted);padding:1rem;'><span class='spinner'></span></td></tr>";
        try {
            const snap = await this.db.collection("users").orderBy("totalReps", "desc").get();
            if (snap.empty) {
                tbody.innerHTML = "<tr><td colspan='5' style='color:var(--text-muted);text-align:center;'>Aucun utilisateur.</td></tr>";
                return;
            }
            tbody.innerHTML = "";
            snap.forEach(doc => {
                const u  = doc.data();
                const tr = document.createElement("tr");
                const isCurrentAdmin = doc.id === currentUid;
                const roleLabel = u.role === "admin"
                    ? "<span class='user-role-badge role-admin'>Admin</span>"
                    : "<span class='user-role-badge role-user'>Utilisateur</span>";
                tr.innerHTML = `
                    <td>${this._escapeHtml(u.displayName || "Anonyme")}</td>
                    <td style="font-size:0.8rem;color:var(--text-muted);">${this._escapeHtml(u.email || "")}</td>
                    <td>${roleLabel}</td>
                    <td><strong>${u.totalReps || 0}</strong></td>
                    <td>
                        ${!isCurrentAdmin ? `<button class="btn btn-danger btn-sm js-remove-user" data-uid="${this._escapeHtml(doc.id)}" data-name="${this._escapeHtml(u.displayName || "cet utilisateur")}">Supprimer</button>` : "<em style='color:var(--text-muted);font-size:0.8rem;'>Vous</em>"}
                    </td>
                `;
                tbody.appendChild(tr);
            });
            // Attach event listeners using data attributes (avoids inline onclick XSS risk)
            tbody.querySelectorAll(".js-remove-user").forEach(btn => {
                btn.addEventListener("click", () => {
                    this.removeUser(btn.dataset.uid, btn.dataset.name);
                });
            });
        } catch (err) {
            console.error("AdminPanel.loadUsers error:", err);
            tbody.innerHTML = "<tr><td colspan='5' style='color:var(--danger);text-align:center;'>Erreur de chargement.</td></tr>";
        }
    }

    /**
     * Remove a user from the platform (delete their Firestore doc & workouts).
     * @param {string} uid         - The user's UID
     * @param {string} displayName - The user's display name (for confirmation)
     */
    async removeUser(uid, displayName) {
        const confirmed = window.confirm(`Supprimer l'utilisateur "${displayName}" et toutes ses données ?`);
        if (!confirmed) return;
        try {
            // Delete user's workouts
            const workSnap = await this.db.collection("workouts").where("userId", "==", uid).get();
            const batch    = this.db.batch();
            workSnap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            // Delete user document
            await this.db.collection("users").doc(uid).delete();

            this.showToast(`✅ Utilisateur "${displayName}" supprimé.`, "success");

            // Reload table
            const tbody = document.getElementById("users-table-body");
            if (tbody) await this.loadUsers(tbody, this.auth.currentUser.uid);

            if (this.loadAdminStats) await this.loadAdminStats();
        } catch (err) {
            console.error("AdminPanel.removeUser error:", err);
            this.showToast("❌ Erreur lors de la suppression.", "error");
        }
    }

    /**
     * Get global statistics (user count, total reps, today's sessions).
     * @returns {Promise<{userCount:number, totalReps:number, todaySessions:number}>}
     */
    async getGlobalStats() {
        const todayStr    = new Date().toISOString().slice(0, 10);
        const [usersSnap, todaySnap] = await Promise.all([
            this.db.collection("users").get(),
            this.db.collection("workouts").where("dateStr", "==", todayStr).get()
        ]);
        let totalReps = 0;
        usersSnap.forEach(doc => { totalReps += doc.data().totalReps || 0; });
        return {
            userCount:     usersSnap.size,
            totalReps:     totalReps,
            todaySessions: todaySnap.size
        };
    }

    // Internal HTML escape utility
    _escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g,  "&amp;")
            .replace(/</g,  "&lt;")
            .replace(/>/g,  "&gt;")
            .replace(/"/g,  "&quot;")
            .replace(/'/g,  "&#39;");
    }
}
