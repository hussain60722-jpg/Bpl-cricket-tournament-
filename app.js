
import { initializeApp } from
"https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getDatabase, ref, onValue, runTransaction
} from
"https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
  getAuth, signInWithEmailAndPassword, signOut,
  onAuthStateChanged
} from
"https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// YOUR FIREBASE CONFIGURATION
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const auctionRef = ref(db, "auction");

const displayMode =
  new URLSearchParams(location.search).get("display") === "1";

let currentData = null;
let unsubscribe = null;

const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");

teams: {
  team1: { name: "Team 1", purse: 200000 },
  team2: { name: "Team 2", purse: 200000 },
  team3: { name: "Team 3", purse: 200000 },
  team4: { name: "Team 4", purse: 200000 }
},

function showMessage(msg) {
  const el = document.getElementById("message");
  if (el) el.textContent = msg;
}

function render() {
  if (!currentData) return;

  const p = currentData.current;

  const name = document.getElementById("playerName");
  if (name) {
    name.textContent = p ? p.name : "No player selected";
    document.getElementById("playerRole").textContent =
      p ? p.role : "";
    document.getElementById("basePrice").textContent =
      p ? money(p.basePrice) : money(0);
    document.getElementById("bidAmount").textContent =
      p ? money(p.bid) : money(0);
    document.getElementById("highestTeam").textContent =
      p && p.highestTeam
        ? currentData.teams[p.highestTeam].name
        : "None";
    document.getElementById("status").textContent =
      p ? p.status : "Waiting";

    document.getElementById("bidBtn").disabled =
      !p || p.status !== "LIVE";
    document.getElementById("soldBtn").disabled =
      !p || p.status !== "LIVE" || !p.highestTeam;
    document.getElementById("unsoldBtn").disabled =
      !p || p.status !== "LIVE";
    document.getElementById("nextBtn").disabled =
      !!p && p.status === "LIVE";
  }

  const teams = document.getElementById("teams");
  if (teams) {
    teams.innerHTML = Object.entries(currentData.teams)
      .map(([id, t]) => `
        <div class="team-card">
          <h3>${escapeHTML(t.name)}</h3>
          <p>Remaining budget: ${money(t.purse)}</p>
        </div>
      `).join("");
  }

  const players = document.getElementById("players");
  if (players) {
    players.innerHTML = Object.values(currentData.players || {})
      .map(p => `
        <div class="team-card">
          <b>${escapeHTML(p.name)}</b>
          <p>${escapeHTML(p.role)} · ${p.status}</p>
        </div>
      `).join("");
  }

  const connection = document.getElementById("connection");
  if (connection) connection.textContent = "● LIVE DATABASE CONNECTED";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

// PUBLIC DISPLAY
function setupDisplay() {
  document.querySelector("main").innerHTML = `
    <h2>🔴 LIVE CRICKET AUCTION</h2>
    <div class="card">
      <h2 id="publicName">Waiting for player</h2>
      <p id="publicRole"></p>
      <h1 id="publicBid">₹0</h1>
      <h3 id="publicTeam">Highest bidder: None</h3>
      <p id="publicStatus">Waiting</p>
    </div>
    <h2>Team Budgets</h2>
    <div id="publicTeams"></div>
  `;

  unsubscribe = onValue(auctionRef, snapshot => {
    const data = snapshot.val();
    if (!data) return;

    currentData = data;
    const p = data.current;

    document.getElementById("publicName").textContent =
      p ? p.name : "Waiting for next player";
    document.getElementById("publicRole").textContent =
      p ? p.role : "";
    document.getElementById("publicBid").textContent =
      p ? money(p.bid) : money(0);
    document.getElementById("publicTeam").textContent =
      "Highest bidder: " +
      (p && p.highestTeam
        ? data.teams[p.highestTeam].name : "None");
    document.getElementById("publicStatus").textContent =
      p ? p.status : "Waiting";

    document.getElementById("publicTeams").innerHTML =
      Object.values(data.teams).map(t => `
        <div class="team-card">
          <b>${escapeHTML(t.name)}</b>
          <p>${money(t.purse)} remaining</p>
        </div>
      `).join("");
  });

  document.getElementById("connection").textContent =
    "Connecting to live auction...";
}

// MANAGEMENT LOGIN
document.getElementById("loginBtn")?.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showMessage("Login successful");
  } catch (e) {
    showMessage("Login failed: " + e.message);
  }
});

document.getElementById("logoutBtn")?.addEventListener("click", () =>
  signOut(auth)
);

onAuthStateChanged(auth, async user => {
  if (displayMode) return;

  if (user) {
    document.getElementById("login").hidden = true;
    document.getElementById("dashboard").hidden = false;

    try {
      const { get } = await import(
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js"
      );

      const snapshot = await get(auctionRef);

      if (!snapshot.exists()) {
        await runTransaction(auctionRef, old => old || initialData());
      }

      if (unsubscribe) unsubscribe();

      unsubscribe = onValue(auctionRef, snapshot => {
        currentData = snapshot.val();
        render();
      });

    } catch (e) {
      showMessage("Database error: " + e.message);
    }
  } else {
    document.getElementById("login").hidden = false;
    document.getElementById("dashboard").hidden = true;
  }
});

// PLACE BID
document.getElementById("bidBtn")?.addEventListener("click", async () => {
  const teamId = document.getElementById("teamSelect").value;

  try {
    const result = await runTransaction(auctionRef, data => {
      if (!data || !data.current ||
          data.current.status !== "LIVE") return;

      const p = data.current;
      const team = data.teams[teamId];

      if (!team || p.highestTeam === teamId) return;

      const nextBid = p.highestTeam
        ? p.bid + 25000
        : p.basePrice;

      if (team.purse < nextBid) return;

      p.bid = nextBid;
      p.highestTeam = teamId;
      p.bidTime = Date.now();

      return data;
    });

    if (!result.committed) alert("Bid not accepted. Check team budget or auction status.");
  } catch (e) {
    alert("Bidding error: " + e.message);
  }
});

// ADD PLAYER
document.getElementById("addPlayerBtn")?.addEventListener("click", async () => {
  const name = document.getElementById("newName").value.trim();
  const role = document.getElementById("newRole").value.trim();
  const price = Number(document.getElementById("newPrice").value);

  if (!name || !role || price <= 0) {
    alert("Enter valid player details.");
    return;
  }

  try {
    await runTransaction(auctionRef, data => {
      if (!data) return;
      data.players ||= {};
      const id = "player_" + Date.now();

      data.players[id] = {
        id, name, role, basePrice: price, status: "UNSOLD"
      };
      return data;
    });

    document.getElementById("newName").value = "";
    document.getElementById("newRole").value = "";
    document.getElementById("newPrice").value = "";
  } catch (e) {
    alert(e.message);
  }
});

// START NEXT PLAYER
document.getElementById("nextBtn")?.addEventListener("click", async () => {
  const result = await runTransaction(auctionRef, data => {
    if (!data) return;
    if (data.current && data.current.status === "LIVE") return;

    const entry = Object.entries(data.players || {})
      .find(([id, p]) => p.status === "UNSOLD");

    if (!entry) return;

    const [id, p] = entry;
    data.current = {
      id, name: p.name, role: p.role,
      basePrice: p.basePrice,
      bid: p.basePrice,
      highestTeam: null,
      status: "LIVE"
    };

    p.status = "LIVE";
    return data;
  });

  if (!result.committed) alert("No available players or previous auction is still live.");
});

// SOLD
document.getElementById("soldBtn")?.addEventListener("click", async () => {
  const result = await runTransaction(auctionRef, data => {
    if (!data || !data.current ||
        data.current.status !== "LIVE" ||
        !data.current.highestTeam) return;

    const p = data.current;
    const team = data.teams[p.highestTeam];

    if (team.purse < p.bid) return;

    team.purse -= p.bid;
    data.players[p.id].status = "SOLD";
    data.players[p.id].soldTo = team.name;
    data.players[p.id].soldPrice = p.bid;

    data.history[p.id] = {
      name: p.name,
      team: team.name,
      price: p.bid,
      status: "SOLD"
    };

    p.status = "SOLD";
    return data;
  });

  if (!result.committed) alert("Could not complete sale.");
});

// UNSOLD
document.getElementById("unsoldBtn")?.addEventListener("click", async () => {
  const result = await runTransaction(auctionRef, data => {
    if (!data || !data.current ||
        data.current.status !== "LIVE") return;

    const p = data.current;
    data.players[p.id].status = "UNSOLD";
    data.history[p.id] = {
      name: p.name,
      status: "UNSOLD"
    };
    p.status = "UNSOLD";
    return data;
  });

  if (!result.committed) alert("Could not mark player unsold.");
});

// PAGE CONTROLS
window.showPage = id => {
  ["auction", "teams", "players"].forEach(page => {
    document.getElementById(page).hidden = page !== id;
  });
};

window.openDisplay = () => {
  window.open(location.pathname + "?display=1", "_blank");
};

if (displayMode) setupDisplay();
