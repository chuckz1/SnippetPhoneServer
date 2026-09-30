// server.js
const express = require("express");
const app = express();

const ALLOW_OPEN_CORS = process.env.ALLOW_OPEN_CORS === "true";
const cors = require("cors");

if (ALLOW_OPEN_CORS) {
	// Enable CORS for all routes
	app.use(cors());
} else {
	// Secure CORS: only allow your production domain
	app.use(
		cors({
			origin: [
				"https://snippetphone.fehringerfarms.com",
				"https://chuckz1.github.io",
			],
			methods: ["GET"],
			allowedHeaders: ["Content-Type"],
			optionsSuccessStatus: 200,
		}),
	);
}

// Parse query strings and JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------------
// CONFIG
// -------------------------------
const TTL_SECONDS = 21600; // 6 hours
const TIMEOUT_MS = 60 * 1000; // 1 minute

// -------------------------------
// IN-MEMORY CACHE (no persistence)
// -------------------------------
let cache = {
	activeUsers: {},
	expiresAt: Date.now() + TTL_SECONDS * 1000,
};

function loadUsers() {
	if (Date.now() > cache.expiresAt) {
		cache.activeUsers = {};
		cache.expiresAt = Date.now() + TTL_SECONDS * 1000;
	}
	return cache.activeUsers;
}

function saveUsers(users) {
	cache.activeUsers = users;
	cache.expiresAt = Date.now() + TTL_SECONDS * 1000;
}

function pruneInactive(users) {
	const now = Date.now();
	for (const u in users) {
		if (now - users[u].lastSeen > TIMEOUT_MS) {
			delete users[u];
		}
	}
	return users;
}

// -------------------------------
// LOGIC FUNCTIONS
// -------------------------------
function handlePing(users, username, offer) {
	const now = Date.now();
	const exists = !!users[username];

	if (offer) {
		users[username] = {
			lastSeen: now,
			offer,
			answer: exists ? users[username].answer : null,
		};
	} else {
		if (!exists || !users[username].offer) {
			return { error: "badPing" };
		}
		users[username].lastSeen = now;
	}

	let answer = null;
	if (users[username].answer) {
		answer = users[username].answer;
		users[username].answer = null;
	}

	return { users, answer };
}

function handleProvideAnswer(users, target, answer) {
	if (!users[target]) return { error: "badAnswer" };
	users[target].answer = answer;
	return { users };
}

function handleGetOffer(users, target) {
	if (!users[target] || !users[target].offer) {
		return { error: "badOffer" };
	}
	return { offer: users[target].offer };
}

function logoutUser(users, username) {
	delete users[username];
	return users;
}

// -------------------------------
// EXPRESS ROUTE (your doGet)
// -------------------------------
app.get("/", (req, res) => {
	const { action, username, offer, target, answer } = req.query;

	let users = loadUsers();
	users = pruneInactive(users);

	if (action === "ping") {
		if (!username) return res.send("Missing username");

		const result = handlePing(users, username, offer);
		if (result.error) return res.send(result.error);

		users = result.users;
		saveUsers(users);

		return res.json({
			users: Object.keys(users),
			answer: result.answer || null,
		});
	}

	if (action === "getOffer") {
		if (!target) return res.send("Missing target");

		const result = handleGetOffer(users, target);
		if (result.error) return res.send(result.error);

		return res.send(result.offer);
	}

	if (action === "sendAnswer") {
		if (!target || !answer) return res.send("Missing target or answer");

		const result = handleProvideAnswer(users, target, answer);
		if (result.error) return res.send(result.error);

		users = result.users;
		saveUsers(users);

		return res.send("ok");
	}

	if (action === "logout") {
		if (!username) return res.send("Missing username");

		users = logoutUser(users, username);
		saveUsers(users);

		return res.send("Logged out");
	}

	return res.send("Unknown action");
});

// -------------------------------
// START SERVER
// -------------------------------
const PORT = 3000;
app.listen(PORT, () => {
	console.log(`Express server running on port ${PORT}`);
});
