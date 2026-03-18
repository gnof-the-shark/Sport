class AdminPanel {
    constructor(db, auth, adminEmail, showToast, updateSportUI, loadAdminStats) {
        this.db = db;
        this.auth = auth;
        this.adminEmail = adminEmail;
        this.showToast = showToast;
        this.updateSportUI = updateSportUI;
        this.loadAdminStats = loadAdminStats;
    }

    async resetScores(sport) {
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

    async loadUsers(tbody, currentUid) {
        const snap = await this.db.collection("users").get();
        tbody.innerHTML = "";
        snap.forEach(doc => {
            const u = doc.data();
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${u.displayName}</td><td>${u.totalReps}</td>`;
            tbody.appendChild(tr);
        });
    }
}
