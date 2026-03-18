class AdminPanel {
    constructor(db, auth, adminEmail, showToast, updateSportUI, loadAdminStats) {
        this.db = db;
        this.auth = auth;
        this.adminEmail = adminEmail;
        this.showToast = showToast;
        this.updateSportUI = updateSportUI;
        this.loadAdminStats = loadAdminStats;
    }

    async resetScores() {
        const batch = this.db.batch();
        const users = await this.db.collection("users").get();
        users.forEach(doc => {
            batch.update(doc.ref, { totalReps: 0 });
        });
        await batch.commit();
        this.showToast("Scores réinitialisés", "success");
    }

    async changeSport(sportKey, customName) {
        await this.db.collection("settings").doc("platform").set({
            currentSport: sportKey,
            customName: customName || ""
        });
        this.updateSportUI(sportKey);
        this.showToast("Sport modifié", "success");
    }

    async loadUsers(tbody, currentUid, adminEmail) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem;">Chargement…</td></tr>';
        try {
            const snap = await this.db.collection("users").orderBy("totalReps", "desc").get();
            tbody.innerHTML = "";
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem;">Aucun utilisateur.</td></tr>';
                return;
            }
            snap.forEach(doc => {
                const u = doc.data();
                const isUserAdmin = u.email === adminEmail;

                const tr = document.createElement("tr");

                const tdName = document.createElement("td");
                tdName.textContent = u.displayName || "–";

                const tdEmail = document.createElement("td");
                tdEmail.textContent = u.email || "–";

                const tdRole = document.createElement("td");
                const badge = document.createElement("span");
                badge.className = "user-role-badge " + (isUserAdmin ? "role-admin" : "role-user");
                badge.textContent = isUserAdmin ? "Admin" : "Membre";
                tdRole.appendChild(badge);

                const tdReps = document.createElement("td");
                tdReps.textContent = u.totalReps || 0;

                const tdAction = document.createElement("td");
                // Admins and the current user cannot be deleted here
                if (!isUserAdmin && doc.id !== currentUid) {
                    const btn = document.createElement("button");
                    btn.className = "btn btn-danger btn-sm";
                    btn.textContent = "Supprimer";
                    const uid        = doc.id;
                    const name       = u.displayName || u.email;
                    btn.onclick = () => window.adminDeleteUser(uid, name, btn);
                    tdAction.appendChild(btn);
                } else {
                    tdAction.textContent = "–";
                }

                tr.appendChild(tdName);
                tr.appendChild(tdEmail);
                tr.appendChild(tdRole);
                tr.appendChild(tdReps);
                tr.appendChild(tdAction);
                tbody.appendChild(tr);
            });
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:1rem;">Erreur de chargement.</td></tr>';
            console.error("loadUsers error:", err);
        }
    }
}
