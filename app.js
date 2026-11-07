    
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// =====================================
// 1. FIREBASE CONFIGURATION
// =====================================

const firebaseConfig = {
  apiKey: "AIzaSyDEikMI0zVvVMkRer7rCEjHGfG451N_EiE",
  authDomain: "boundarycricketauction.firebaseapp.com",
  databaseURL: "https://boundarycricketauction-default-rtdb.firebaseio.com/",
  projectId: "boundarycricketauction",
  storageBucket: "boundarycricketauction.firebasestorage.app",
  messagingSenderId: "56217539285",
  appId: "1:56217539285:web:808a93079a6c25b8c8c85c",
  measurementId: "G-7TW8SS9GDD"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

// CHANGE THIS TO YOUR ADMIN EMAIL
const ADMIN_EMAILS = [
  "replace-with-your-admin-email@example.com"
];

const STARTING_BUDGET = 200000;
const AUCTION_PATH = "auction";

// =====================================
// 2. HTML ELEMENTS
// =====================================

const $ = id => document.getElementById(id);

const loginPanel = $("login");
const appPanel = $("app");
const message = $("message");

let currentUser = null;
let currentRole = null;
let currentTeamId = null;
let auctionData = null;
let editingPlayerId = null;
let unsubscribeAuction = null;

// =====================================
// 3. BASIC HELPERS
// =====================================

function money(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? "#dc2626" : "#15803d";
}

function isAdmin() {
  return currentRole === "admin";
}

function getTeams() {
  return auctionData?.teams || {};
}

function getPlayers() {
  return auctionData?.players || {};
}

function getTeamName(teamId) {
  return getTeams()[teamId]?.name || teamId;
}

function canManage() {
  return isAdmin();
}

// =====================================
// 4. INITIAL AUCTION DATA
// =====================================

function initialData() {
  return {
    teams: {
      team1: {
        name: "Team 1",
        purse: STARTING_BUDGET,
        spent: 0,
        players: {}
      },
      team2: {
        name: "Team 2",
        purse: STARTING_BUDGET,
        spent: 0,
        players: {}
      },
      team3: {
        name: "Team 3",
        purse: STARTING_BUDGET,
        spent: 0,
        players: {}
      },
      team4: {
        name: "Team 4",
        purse: STARTING_BUDGET,
        spent: 0,
        players: {}
      }
    },
    players: {},
    history: {},
    settings: {
      minIncrement: 1000
    },
    currentPlayerId: null
  };
}

// =====================================
// 5. INITIALIZE / MIGRATE DATABASE
// =====================================

async function initializeDatabase() {
  const auctionRef = ref(db, AUCTION_PATH);
  const snapshot = await get(auctionRef);

  if (!snapshot.exists()) {
    await set(auctionRef, initialData());
    return;
  }

  const data = snapshot.val();
  const changes = {};

  const defaults = initialData();

  for (const teamId of Object.keys(defaults.teams)) {
    if (!data.teams?.[teamId]) {
      changes[`teams/${teamId}`] = defaults.teams[teamId];
    } else {
      const team = data.teams[teamId];

      if (team.spent === undefined) {
        changes[`teams/${teamId}/spent`] = 0;
      }

      if (!team.players) {
        changes[`teams/${teamId}/players`] = {};
      }
    }
  }

  if (!data.players) changes.players = {};
  if (!data.history) changes.history = {};
  if (!data.settings) {
    changes.settings = defaults.settings;
  } else if (!data.settings.minIncrement) {
    changes["settings/minIncrement"] = 1000;
  }

  if (data.currentPlayerId === undefined) {
    changes.currentPlayerId = null;
  }

  if (Object.keys(changes).length) {
    await update(auctionRef, changes);
  }
}

// =====================================
// 6. LOGIN
// =====================================

$("loginBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    showMessage("Enter email and password.");
    return;
  }

  try {
    showMessage("Logging in...", false);

    await signInWithEmailAndPassword(auth, email, password);

  } catch (error) {
    showMessage(error.message);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

// =====================================
// 7. AUTHENTICATION AND USER ROLE
// =====================================

onAuthStateChanged(auth, async user => {
  if (unsubscribeAuction) {
    unsubscribeAuction();
    unsubscribeAuction = null;
  }

  currentUser = user;
  auctionData = null;
  currentRole = null;
  currentTeamId = null;

  if (!user) {
    loginPanel.hidden = false;
    appPanel.hidden = true;
    $("password").value = "";
    return;
  }

  try {
    await initializeDatabase();

    const email = (user.email || "").toLowerCase();

    if (ADMIN_EMAILS.map(x => x.toLowerCase()).includes(email)) {
      currentRole = "admin";
    } else {
      const teamSnapshot = await get(
        ref(db, `teamUsers/${user.uid}`)
      );

      if (!teamSnapshot.exists()) {
        await signOut(auth);
        showMessage("This account is not assigned to a team.");
        return;
      }

      currentTeamId = teamSnapshot.val().teamId;

      if (!["team1", "team2", "team3", "team4"].includes(currentTeamId)) {
        await signOut(auth);
        showMessage("Invalid team assignment.");
        return;
      }

      currentRole = "team";
    }

    loginPanel.hidden = true;
    appPanel.hidden = false;

    $("welcome").textContent =
      currentRole === "admin"
        ? "Management Dashboard"
        : "Team Dashboard";

    $("roleLabel").textContent =
      currentRole === "admin"
        ? "Administrator"
        : "Logged in as " + currentTeamId;

    $("adminSettings").hidden = !isAdmin();
    $("addPlayerPanel").hidden = !isAdmin();
    $("adminAuctionButtons").hidden = !isAdmin();
    $("teamPickerWrap").hidden = !isAdmin();
    $("teamPurchasesPanel").hidden = isAdmin();

    $("teamSummary").hidden = !isAdmin();

    $("teamSelect").value = currentTeamId || "team1";

    subscribeAuction();

  } catch (error) {
    console.error(error);
    showMessage("Login setup error: " + error.message);
  }
});

// =====================================
// 8. REALTIME DATABASE LISTENER
// =====================================

function subscribeAuction() {
  unsubscribeAuction = onValue(
    ref(db, AUCTION_PATH),
    snapshot => {
      auctionData = snapshot.val();

      if (!auctionData) return;

      renderEverything();
      $("connection").textContent = "● Connected";
    },
    error => {
      console.error(error);
      $("connection").textContent = "Connection error";
    }
  );
}

// =====================================
// 9. RENDER ALL DASHBOARDS
// =====================================

function renderEverything() {
  renderCurrentPlayer();
  renderTeams();
  renderPlayers();
  renderHistory();
  renderPurchases();
  renderSettings();
}

// =====================================
// 10. LIVE PLAYER DISPLAY
// =====================================

function renderCurrentPlayer() {
  const player = getPlayers()[auctionData.currentPlayerId];

  if (!player) {
    $("playerName").textContent = "No player selected";
    $("playerRole").textContent = "";
    $("basePrice").textContent = money(0);
    $("bidAmount").textContent = money(0);
    $("highestTeam").textContent = "None";
    $("status").textContent = "Waiting";
    $("manualBid").value = "";
    $("bidHint").textContent = "";
    return;
  }

  $("playerName").textContent = player.name;
  $("playerRole").textContent = player.role || "";
  $("basePrice").textContent = money(player.basePrice);
  $("bidAmount").textContent = money(player.bid || 0);

  $("highestTeam").textContent =
    player.highestTeam
      ? getTeamName(player.highestTeam)
      : "None";

  $("status").textContent = player.status || "UNSOLD";

  const teamId = isAdmin()
    ? $("teamSelect").value
    : currentTeamId;

  const team = getTeams()[teamId];

  const nextMinimum = player.bid
    ? Number(player.bid) + Number(auctionData.settings?.minIncrement || 1000)
    : Number(player.basePrice || 0);

  $("bidHint").textContent =
    `Minimum next bid: ${money(nextMinimum)} | Remaining budget: ${money(team?.purse || 0)}`;

  $("manualBid").placeholder = `Minimum ${nextMinimum}`;
}

// =====================================
// 11. TEAM BUDGET SUMMARY
// =====================================

function renderTeams() {
  if (!isAdmin()) return;

  const teams = getTeams();

  $("teams").innerHTML = Object.entries(teams).map(([id, team]) => {
    const spent = Number(team.spent || 0);
    const purse = Number(team.purse || 0);

    const playerCount = Object.keys(team.players || {}).length;

    return `
      <div class="team-card">
        <h3>${escapeHTML(team.name || id)}</h3>
        <p>Starting budget: ${money(STARTING_BUDGET)}</p>
        <p>Spent: <b>${money(spent)}</b></p>
        <p>Remaining: <b>${money(purse)}</b></p>
        <p>Players: ${playerCount}</p>
      </div>
    `;
  }).join("");
}

// =====================================
// 12. MANUAL BIDDING
// =====================================

$("bidBtn").addEventListener("click", async () => {
  if (!auctionData) return;

  const teamId = isAdmin()
    ? $("teamSelect").value
    : currentTeamId;

  const amount = Number($("manualBid").value);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    alert("Enter a valid whole-number bid.");
    return;
  }

  const playerId = auctionData.currentPlayerId;

  if (!playerId) {
    alert("No active player.");
    return;
  }

  try {
    const result = await runTransaction(
      ref(db, `${AUCTION_PATH}/players/${playerId}`),
      player => {
        if (!player || player.status !== "LIVE") return;

        if (player.highestTeam === teamId) return;

        const team = auctionData.teams?.[teamId];

        if (!team) return;

        const minimum = player.bid
          ? Number(player.bid) + Number(
              auctionData.settings?.minIncrement || 1000
            )
          : Number(player.basePrice);

        if (amount < minimum) return;
        if (amount > Number(team.purse || 0)) return;

        player.bid = amount;
        player.highestTeam = teamId;

        return player;
      },
      { applyLocally: false }
    );

    if (!result.committed) {
      alert("Bid rejected. Check the minimum bid, budget and current bidder.");
      return;
    }

    $("manualBid").value = "";

  } catch (error) {
    alert("Bid error: " + error.message);
  }
});

// =====================================
// 13. START NEXT PLAYER
// =====================================

$("nextBtn").addEventListener("click", async () => {
  if (!isAdmin()) return;

  const players = getPlayers();

  const next = Object.entries(players).find(
    ([id, player]) =>
      player.status === "UNSOLD" &&
      !player.auctioned
  );

  if (!next) {
    alert("No more available players.");
    return;
  }

  const [playerId, player] = next;

  try {
    await update(ref(db, AUCTION_PATH), {
      currentPlayerId: playerId,
      [`players/${playerId}/status`]: "LIVE",
      [`players/${playerId}/auctioned`]: true
    });

  } catch (error) {
    alert(error.message);
  }
});

// =====================================
// 14. SOLD PLAYER
// =====================================

$("soldBtn").addEventListener("click", async () => {
  if (!isAdmin()) return;

  const playerId = auctionData.currentPlayerId;
  const player = getPlayers()[playerId];

  if (!player || player.status !== "LIVE") {
    alert("No live player.");
    return;
  }

  if (!player.highestTeam || !player.bid) {
    alert("No valid bid received.");
    return;
  }

  const teamId = player.highestTeam;
  const team = getTeams()[teamId];

  if (!team || Number(team.purse) < Number(player.bid)) {
    alert("Team does not have enough remaining budget.");
    return;
  }

  if (!confirm(`Sell ${player.name} to ${getTeamName(teamId)} for ${money(player.bid)}?`)) {
    return;
  }

  const timestamp = Date.now();
  const historyId = "sold_" + playerId + "_" + timestamp;

  const updates = {};

  updates[`players/${playerId}/status`] = "SOLD";
  updates[`players/${playerId}/soldTo`] = teamId;
  updates[`players/${playerId}/soldPrice`] = Number(player.bid);

  updates[`teams/${teamId}/purse`] =
    Number(team.purse) - Number(player.bid);

  updates[`teams/${teamId}/spent`] =
    Number(team.spent || 0) + Number(player.bid);

  updates[`teams/${teamId}/players/${playerId}`] = true;

  updates[`history/${historyId}`] = {
    playerId,
    playerName: player.name,
    teamId,
    teamName: team.name,
    price: Number(player.bid),
    action: "SOLD",
    time: timestamp
  };

  updates.currentPlayerId = null;

  try {
    await update(ref(db, AUCTION_PATH), updates);
    alert("Player sold successfully!");
  } catch (error) {
    alert("Sale error: " + error.message);
  }
});

// =====================================
// 15. UNSOLD PLAYER
// =====================================

$("unsoldBtn").addEventListener("click", async () => {
  if (!isAdmin()) return;

  const playerId = auctionData.currentPlayerId;
  const player = getPlayers()[playerId];

  if (!player || player.status !== "LIVE") {
    alert("No live player.");
    return;
  }

  const updates = {};

  updates[`players/${playerId}/status`] = "UNSOLD";
  updates[`history/unsold_${playerId}_${Date.now()}`] = {
    playerId,
    playerName: player.name,
    action: "UNSOLD",
    time: Date.now()
  };

  updates.currentPlayerId = null;

  try {
    await update(ref(db, AUCTION_PATH), updates);
  } catch (error) {
    alert(error.message);
  }
});

// =====================================
// 16. ADD PLAYER
// =====================================

$("addPlayerBtn").addEventListener("click", async () => {
  if (!isAdmin()) return;

  const name = $("newName").value.trim();
  const role = $("newRole").value.trim();
  const basePrice = Number($("newPrice").value);

  if (!name || !role || !Number.isSafeInteger(basePrice) || basePrice <= 0) {
    alert("Enter a player name, role and valid base price.");
    return;
  }

  try {
    if (editingPlayerId) {
      const player = getPlayers()[editingPlayerId];

      if (!player || player.status === "LIVE" || player.status === "SOLD") {
        alert("This player cannot be edited.");
        return;
      }

      await update(
        ref(db, `${AUCTION_PATH}/players/${editingPlayerId}`),
        {
          name,
          role,
          basePrice,
          bid: 0,
          highestTeam: null,
          status: "UNSOLD",
          auctioned: false
        }
      );

      editingPlayerId = null;
      $("playerFormTitle").textContent = "Add player";
      $("addPlayerBtn").textContent = "Add player";
      $("cancelEditBtn").hidden = true;

    } else {
      const newRef = ref(db, `${AUCTION_PATH}/players`);
      const snapshot = await get(newRef);
      const players = snapshot.val() || {};

      const id = "player_" + Date.now();

      await set(ref(db, `${AUCTION_PATH}/players/${id}`), {
        name,
        role,
        basePrice,
        bid: 0,
        highestTeam: null,
        status: "UNSOLD",
        auctioned: false,
        createdAt: Date.now()
      });
    }

    $("newName").value = "";
    $("newRole").value = "";
    $("newPrice").value = "";

  } catch (error) {
    alert(error.message);
  }
});

// =====================================
// 17. EDIT PLAYER
// =====================================

window.editPlayer = function(playerId) {
  if (!isAdmin()) return;

  const player = getPlayers()[playerId];

  if (!player || player.status === "LIVE" || player.status === "SOLD") {
    alert("Only available unsold players can be edited.");
    return;
  }

  editingPlayerId = playerId;

  $("newName").value = player.name;
  $("newRole").value = player.role;
  $("newPrice").value = player.basePrice;

  $("playerFormTitle").textContent = "Edit player";
  $("addPlayerBtn").textContent = "Update player";
  $("cancelEditBtn").hidden = false;

  $("addPlayerPanel").scrollIntoView({ behavior: "smooth" });
};

// =====================================
// 18. CANCEL EDIT
// =====================================

$("cancelEditBtn").addEventListener("click", () => {
  editingPlayerId = null;

  $("newName").value = "";
  $("newRole").value = "";
  $("newPrice").value = "";

  $("playerFormTitle").textContent = "Add player";
  $("addPlayerBtn").textContent = "Add player";
  $("cancelEditBtn").hidden = true;
});

// =====================================
// 19. DELETE PLAYER
// =====================================

window.deletePlayer = async function(playerId) {
  if (!isAdmin()) return;

  const player = getPlayers()[playerId];

  if (!player || player.status === "LIVE" || player.status === "SOLD") {
    alert("Only unsold, inactive players can be deleted.");
    return;
  }

  if (!confirm(`Delete ${player.name}?`)) return;

  try {
    await set(
      ref(db, `${AUCTION_PATH}/players/${playerId}`),
      null
    );
  } catch (error) {
    alert(error.message);
  }
};

// =====================================
// 20. PLAYER LIST AND SEARCH
// =====================================

$("playerSearch").addEventListener("input", renderPlayers);
$("statusFilter").addEventListener("change", renderPlayers);

function renderPlayers() {
  const players = getPlayers();

  const search = $("playerSearch").value.toLowerCase().trim();
  const filter = $("statusFilter").value;

  const rows = Object.entries(players).filter(([id, p]) => {
    const matchesSearch =
      (p.name || "").toLowerCase().includes(search) ||
      (p.role || "").toLowerCase().includes(search);

    const matchesStatus =
      filter === "ALL" || p.status === filter;

    return matchesSearch && matchesStatus;
  });

  if (!rows.length) {
    $("players").innerHTML = "<p>No players found.</p>";
    return;
  }

  $("players").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>Role</th>
          <th>Base price</th>
          <th>Bid / sold price</th>
          <th>Status</th>
          <th>Team</th>
          ${isAdmin() ? "<th>Actions</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${rows.map(([id, p]) => `
          <tr>
            <td>${escapeHTML(p.name)}</td>
            <td>${escapeHTML(p.role)}</td>
            <td>${money(p.basePrice)}</td>
            <td>${money(p.soldPrice || p.bid || 0)}</td>
            <td class="status-${String(p.status || "").toLowerCase()}">
              ${escapeHTML(p.status || "UNSOLD")}
            </td>
            <td>${escapeHTML(
              p.soldTo ? getTeamName(p.soldTo) :
              p.highestTeam ? getTeamName(p.highestTeam) : "-"
            )}</td>
            ${isAdmin() ? `
              <td>
                ${p.status !== "LIVE" && p.status !== "SOLD" ? `
                  <button onclick="editPlayer('${id}')">Edit</button>
                  <button class="danger" onclick="deletePlayer('${id}')">Delete</button>
                ` : "-"}
              </td>
            ` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// =====================================
// 23. MINIMUM BID INCREMENT
// =====================================

function renderSettings() {
  if (!isAdmin()) return;

  $("minIncrement").value =
    auctionData.settings?.minIncrement || 1000;
}

$("saveSettingsBtn").addEventListener("click", async () => {
  if (!isAdmin()) return;

  const increment = Number($("minIncrement").value);

  if (!Number.isSafeInteger(increment) || increment <= 0) {
    alert("Enter a valid positive whole-number increment.");
    return;
  }

  try {
    await set(
      ref(db, `${AUCTION_PATH}/settings/minIncrement`),increment
    );

    alert("Minimum bid increment saved.");
  } catch (error) {
    alert(error.message);
  }
});

// =====================================
// 24. EXPORT RESULTS TO CSV
// =====================================

$("exportBtn").addEventListener("click", () => {
  if (!isAdmin()) return;

  const rows = [
    ["Player", "Role", "Base Price", "Result", "Team", "Sold Price"]
  ];

  for (const player of Object.values(getPlayers())) {
    rows.push([
      player.name || "",
      player.role || "",
      player.basePrice || 0,
      player.status || "",
      player.soldTo ? getTeamName(player.soldTo) : "",
      player.soldPrice || 0
    ]);
  }
  rows.push([]);
  rows.push(["TEAM SPENDING SUMMARY"]);
  rows.push(["Team", "Spent", "Remaining", "Players"]);

  for (const [id, team] of Object.entries(getTeams())) {
    rows.push([
      team.name || id,
      team.spent || 0,
      team.purse || 0,
      Object.keys(team.players || {}).length
    ]);
  }

  rows.push([]);
  rows.push(["AUCTION HISTORY"]);
  rows.push(["Player", "Result", "Team", "Price", "Date"]);

  const history = Object.values(auctionData.history || {});

  history.forEach(h => {
    rows.push([
      h.playerName || "",
      h.action || "",
      h.teamName || "",
      h.price || 0,
      h.time ? new Date(h.time).toLocaleString("en-IN") : ""
    ]);
  });
  const csv = rows.map(row =>
    row.map(value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(",")
  ).join("\r\n");

  const blob = new Blob(
    ["\uFEFF" + csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "Boundary_Cricket_Auction_Results.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
});