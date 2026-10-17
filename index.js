const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, "users.json");

app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (HTML, CSS, JS)

// Load users from the file
function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch (error) {
        return {}; // Return an empty object if file doesn't exist
    }
}

// Save users to the file
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// Handle login and redirect if user does not exist
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    let users = loadUsers();

    if (!username || !password) {
        return res.json({ success: false, message: "Username and password required!" });
    }

    if (users[username]) {
        if (users[username].password === password) {
            return res.json({ success: true, message: "Login successful!", redirect: "code4.html" });
        } else {
            return res.json({ success: false, message: "Incorrect password!" });
        }
    } else {
        return res.json({ success: false, message: "User not found. Redirecting to registration.", redirect: "code3.html" });
    }
});

// Handle account creation
app.post("/register", (req, res) => {
    const { name, dob, aadhaar, phone, email, address, password } = req.body;
    let users = loadUsers();

    if (users[email]) {
        return res.json({ success: false, message: "Email already registered!" });
    }

    // Store user details
    users[email] = { name, dob, aadhaar, phone, email, address, password };
    saveUsers(users);

    res.json({ success: true, message: "Account created successfully!" });
});

// Start the server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
