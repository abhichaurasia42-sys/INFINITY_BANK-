const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, "users.json");

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Load users from file
function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch {
        return {};
    }
}

// Save users to file
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// Binary Search Tree
class Node {
    constructor(accountNumber, userData) {
        this.accountNumber = accountNumber;
        this.userData = userData;
        this.left = null;
        this.right = null;
    }
}

class BST {
    constructor() {
        this.root = null;
    }

    insert(accountNumber, userData) {
        const newNode = new Node(accountNumber, userData);
        if (!this.root) return (this.root = newNode);
        let current = this.root;
        while (true) {
            if (accountNumber < current.accountNumber) {
                if (!current.left) return (current.left = newNode);
                current = current.left;
            } else {
                if (!current.right) return (current.right = newNode);
                current = current.right;
            }
        }
    }

    search(accountNumber) {
        let current = this.root;
        while (current) {
            if (accountNumber === current.accountNumber) return current.userData;
            current = accountNumber < current.accountNumber ? current.left : current.right;
        }
        return null;
    }
}

// Load BST from users file
function loadUsersIntoBST() {
    const bst = new BST();
    try {
        const users = loadUsers();
        Object.keys(users).forEach(acc => {
            bst.insert(acc, users[acc]);
        });
        return bst;
    } catch {
        return null;
    }
}

// Nodemailer Setup
const emailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : "";
const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, "") : "";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: emailUser,
        pass: emailPass
    }
});

// Verify SMTP connection on startup
if (!emailUser || !emailPass) {
    console.error("⚠️ [Nodemailer] Warning: EMAIL_USER or EMAIL_PASS is missing in .env!");
} else {
    transporter.verify((error, success) => {
        if (error) {
            console.error("❌ [Nodemailer] Verification failed:", error);
            if (error.responseCode === 534 || (error.message && error.message.includes("534"))) {
                console.error("👉 [Nodemailer] Google blocked this login (534-5.7.9 WebLoginRequired).");
                console.error("   Gmail requires a 16-character Google 'App Password' when 2-Step Verification is active.");
                console.error("   Generate one at: https://myaccount.google.com/apppasswords");
            }
        } else {
            console.log("✅ [Nodemailer] Transporter is ready to send emails.");
        }
    });
}

const OTP_STORE = {};

function generateUniqueNumber(length) {
    return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPviaEmail(name, email, otp) {
    try {
        console.log(`📨 [Nodemailer] Sending OTP to ${email}...`);
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your Infinity Bank OTP",
            text: `Dear ${name}, your OTP is: ${otp}`
        });
        console.log(`✅ [Nodemailer] OTP email sent successfully to ${email}. Response:`, info.response);
        console.log(`Dear ${name}, your OTP is: ${otp}`);
        return true;
    } catch (error) {
        console.error(`❌ [Nodemailer] Error sending OTP email to ${email}:`, error);
        return false;
    }
}

async function sendNotificationEmail(to, subject, text) {
    if (!to) {
        console.warn("⚠️ [Nodemailer] Cannot send email: recipient email missing.");
        return;
    }
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            text
        });
        console.log(`✉️ [Nodemailer] Notification sent to ${to} [Subject: "${subject}"]`);
        return info;
    } catch (error) {
        console.error(`❌ [Nodemailer] Failed to send notification email to ${to} [Subject: "${subject}"]:`, error);
    }
}

// 🔐 LOGIN
app.post("/login", (req, res) => {
    const { accountNumber, password } = req.body;
    const bst = loadUsersIntoBST();
    if (!bst) return res.json({ success: false, message: "Server error." });

    const user = bst.search(accountNumber);
    if (!user) {
        return res.json({ success: false, message: "Account not found!", redirect: "code3.html" });
    }
    if (user.password !== password) {
        return res.json({ success: false, message: "Incorrect password!" });
    }
    res.json({ success: true, message: `Welcome, ${user.name}!`, redirect: "code4.html", ...user });
});

// 🧾 REGISTER
app.post("/register", (req, res) => {
    const { name, dob, aadhaar, phone, email, address, password } = req.body;
    let users = loadUsers();
    const accountNumber = generateUniqueNumber(15);
    const cardNumber = generateUniqueNumber(16);

    if (Object.values(users).some(u => u.email === email)) {
        return res.json({ success: false, message: "Email already in use!" });
    }

    users[accountNumber] = { name, dob, aadhaar, phone, email, address, password, cardNumber, balance: 0, transactions: [] };
    sendNotificationEmail(
        email,
        "Welcome to INFINITY BANK",
        `Dear ${name} , \n\nYou have successfully created your account in INFINITY BANK on ${new Date().toLocaleString()} ! \n\n Account Number : ${accountNumber}  .\n\n Card number :${cardNumber}.\n\n Save these details for future references.`
    );
    saveUsers(users);
    res.json({ success: true, message: "Account created!",name:name,accountNumber:accountNumber });
});

// 📩 REQUEST OTP
app.post("/request-otp", async (req, res) => {
    const { accountNumber } = req.body;
    const users = loadUsers();
    const user = users[accountNumber];

    if (!user) return res.json({ success: false, message: "User not found!" });

    const otp = generateOTP();
    OTP_STORE[accountNumber] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    const sent = await sendOTPviaEmail(user.name, user.email, otp);
    res.json({ success: sent, message: sent ? "OTP sent!" : "Failed to send OTP!" });
});

app.post("/request-email-otp", async (req, res) => {
    const { name, email } = req.body;

    if (!email) return res.json({ success: false, message: "Email is required" });

    const users = loadUsers(); // Should return an object like { "accountNumber": { ...userData } }

    // Convert object values to array and check for existing email
    const userExists = Object.values(users).some(user => user.email === email);

    if (userExists) {
        return res.json({ 
            success: false, 
            message: "Email already registered. Please use a different email." 
        });
    }

    // Email doesn't exist, proceed to send OTP
    const otp = generateOTP();
    OTP_STORE[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

    const sent = await sendOTPviaEmail(name, email, otp);

    return res.json({ 
        success: sent, 
        message: sent ? "OTP sent!" : "Failed to send OTP!" 
    });
});



// 💸 TRANSACTION
app.post("/transaction", (req, res) => {
    const { accountNumber, type, amount, otp } = req.body;
    let users = loadUsers();
    let user = users[accountNumber];

    if (!user || !OTP_STORE[accountNumber] || OTP_STORE[accountNumber].otp !== otp || OTP_STORE[accountNumber].expires < Date.now()) {
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }

    if (type === "deposit") {
        user.balance += amount;
        user.transactions.push(`${new Date().toLocaleString()} - Deposited ₹${amount}`);
        saveUsers(users);
        sendNotificationEmail(
            user.email,
            "Deposited Balance",
            `Account Number  ${accountNumber}  has been CREDITED with amount Rs ${amount} on ${new Date().toLocaleString()} .Credited Balance : RS ${amount} . [Current Balance: ${user.balance}.] }`
        );
    } else if (type === "withdraw") {
        if (user.balance < amount) return res.json({ success: false, message: "Insufficient balance!" });
        user.balance -= amount;
        user.transactions.push(`${new Date().toLocaleString()} - Withdrew ₹${amount}`);
        saveUsers(users);
        sendNotificationEmail(
            user.email,
            "Debited Balance",
            `Account Number  ${accountNumber} has been DEBITED with amount Rs ${amount} on ${new Date().toLocaleString()} .Debited Balance : RS ${amount} [Current Balance: ${user.balance}.] }`
        );
    }

    
    delete OTP_STORE[accountNumber];
    res.json({ success: true, balance: user.balance, transactions: user.transactions, message: "Transaction Successful" });

});

// 🔁 RECHARGE
app.post("/recharge", (req, res) => {
    const { accountNumber, amount, otp } = req.body;
    const users = loadUsers();
    const user = users[accountNumber];

    if (!user || !OTP_STORE[accountNumber] || OTP_STORE[accountNumber].otp !== otp || OTP_STORE[accountNumber].expires < Date.now()) {
        return res.json({ success: false, message: "Invalid OTP or user not found!" });
    }

    if (user.balance < amount) {
        return res.json({ success: false, message: "Insufficient balance!" });
    }

    user.balance -= amount;
    user.transactions.push(`${new Date().toLocaleString()} - recharge for ₹${amount}`);
    saveUsers(users);
    sendNotificationEmail(
        user.email,
        "Debited Balance",
        `Account Number  ${accountNumber} has been DEBITED with amount Rs ${amount} on ${new Date().toLocaleString()}  for Recharge.Debited Balance : RS ${amount} [Current Balance: ${user.balance}.] }`
    );
    
    delete OTP_STORE[accountNumber];

    res.json({ success: true, message: "Recharge done", newBalance: user.balance });
});

// 📋 GET TRANSACTIONS
app.get("/transactions", (req, res) => {
    const accountNumber = req.query.accountNumber;
    const users = loadUsers();
    const user = users[accountNumber];
    if (!user) return res.json({ success: false, message: "User not found!" });
    res.json({ success: true, balance: user.balance, transactions: user.transactions });
});

// 💳 GET CARD DETAILS
app.post("/get-card-details", (req, res) => {
    const { accountNumber, password } = req.body;
    const users = loadUsers();
    const user = users[accountNumber];

    if (!user || user.password !== password) {
        return res.json({ success: false, message: "Invalid credentials!" });
    }

    res.json({ success: true, name: user.name, cardNumber: user.cardNumber, expiry: "12/28" });
});

app.get("/getUserDetails", (req, res) => {
    const { accountNumber } = req.query;
    let users = loadUsers();

    if (!users[accountNumber]) {
        return res.status(400).json({ success: false, message: "User not found!" });
    }

    const { name, email, cardNumber, address, dob, balance } = users[accountNumber];
    res.json({ success: true, name, email, accountNumber, cardNumber, address, dob, balance });
});


// 🔍 VERIFY PASSWORD
app.post("/verify-password", (req, res) => {
    const { accountNumber, password } = req.body;
    const users = loadUsers();
    const user = users[accountNumber];

    if (!user || user.password !== password) {
        return res.json({ success: false, message: "Incorrect password!" });
    }

    res.json({ success: true, accountNumber: user.accountNumber });
});

// 🧾 BILL PAYMENT
app.post("/pay-bill", (req, res) => {
    const { accountNumber, billType, billNumber, amount, otp } = req.body;
    const users = loadUsers();
    const user = users[accountNumber];

    if (!user || !OTP_STORE[accountNumber] || OTP_STORE[accountNumber].otp !== otp || OTP_STORE[accountNumber].expires < Date.now()) {
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }

    if (user.balance < amount) {
        return res.json({ success: false, message: "Insufficient balance!" });
    }

    user.balance -= amount;
    user.transactions.push(`${new Date().toLocaleString()} - Paid ₹${amount} for ${billType} bill #${billNumber}`);
    saveUsers(users);
    sendNotificationEmail(
        user.email,
        "Debited Balance",
        `Account Number  ${accountNumber} has been  DEBITED with amount Rs ${amount} on ${new Date().toLocaleString()} for ${billType} bill#${billNumber} .Debited Balance : RS ${amount} [Current Balance: ${user.balance}.] }`
    );
    
    delete OTP_STORE[accountNumber];

    res.json({ success: true, message: "Bill paid successfully!", newBalance: user.balance });
});

// 🔐 FORGOT PASSWORD - REQUEST OTP
app.post("/forgot-password-request", async (req, res) => {
    const { accountNumber } = req.body;
    const users = loadUsers();
    const user = users[accountNumber];
    if (!user) return res.json({ success: false, message: "Account not found!" });

    const otp = generateOTP();
    OTP_STORE[accountNumber] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    const sent = await sendOTPviaEmail(user.name, user.email, otp);

    res.json({ success: sent, message: sent ? "OTP sent!" : "Failed to send OTP!" });
});

// 🔐 VERIFY OTP
app.post("/verify-otp", (req, res) => {
    const { accountNumber, otp } = req.body;
    if (!OTP_STORE[accountNumber] || OTP_STORE[accountNumber].otp !== otp || OTP_STORE[accountNumber].expires < Date.now()) {
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }
    delete OTP_STORE[accountNumber];
    res.json({ success: true, message: "OTP verified!" });
});
app.post("/change-password", (req, res) => {
    const { accountNumber, newPassword } = req.body;
    const users = loadUsers();

    if (!users[accountNumber] || !newPassword) {
        return res.json({ success: false, message: "Enter a valid account number and new password." });
    }

    users[accountNumber].password = newPassword;
    saveUsers(users); // Save the updated user data back to the file

    res.json({ success: true, message: "Password changed successfully" });
});


app.post("/verify-email-otp", (req, res) => {
    const {email, otp } = req.body;
    console.log("email:",email,"otp:",otp);
    if (!OTP_STORE[email] || OTP_STORE[email].otp !== otp || OTP_STORE[email].expires < Date.now()) {
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }
    delete OTP_STORE[email];
    res.json({ success: true, message: "OTP verified!" });
});









app.post("/verify-recipient", (req, res) => {
    console.log("🔔 Incoming request to /verify-recipient");
  
    const { accountNumber, recipientAccount } = req.body;
    console.log("📥 Received account number:", recipientAccount);
  
    const users = loadUsers();
    console.log("📄 Users loaded:", users);
    if (accountNumber==recipientAccount) {
        console.log("❌ enter a valid recipent");
        return res.json({ success: false, message: "Self Transfer is Unavailable" });
      }
  
    if (!users[recipientAccount]) {
      console.log("❌ Recipient not found");
      return res.json({ success: false, message: "Recipient not found." });
    }
  
    console.log("✅ Recipient found:", users[recipientAccount].name);
    return res.json({ success: true, name: users[recipientAccount].name });
  });
  

  app.post("/send-money", (req, res) => {
    const { accountNumber, recipientAccount, amount, otp } = req.body;
    const users = loadUsers();
  
    if (!OTP_STORE[accountNumber] || OTP_STORE[accountNumber].otp !== otp || OTP_STORE[accountNumber].expires < Date.now()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
    }
  
    const sender = users[accountNumber];
    const receiver = users[recipientAccount];
  
    if (!sender || !receiver) {
      return res.status(400).json({ success: false, message: "Invalid accounts." });
    }
  
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount." });
    }
  
    if (sender.balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance." });
    }
  
    sender.balance -= amount;
    receiver.balance += amount;
  
    sender.transactions.push(`${new Date().toLocaleString()} - Sent ₹${amount} to ${receiver.name}`);
    receiver.transactions.push(`${new Date().toLocaleString()} - Received ₹${amount} from ${sender.name}`);
    saveUsers(users);
    sendNotificationEmail(
        sender.email,
        "Debited Balance",
        `Account Number  ${sender.accountNumber} has tranferred  amount Rs ${amount} to ${receiver.name} on ${new Date().toLocaleString()}  .Debited Balance : RS ${amount} [Current Balance: ${sender.balance}.] }`
    );
    sendNotificationEmail(
        receiver.email,
        "Credited Balance",
        `Account Number  ${receiver.accountNumber} has been  transferred with amount Rs ${amount} by ${sender.name} on ${new Date().toLocaleString()}  .Credited Balance : RS ${amount} [Current Balance: ${receiver.balance}.] }`
    );
  
    
    delete OTP_STORE[accountNumber];
  
    res.json({ success: true, message: "Transaction successful." });
  });






// ✅ Handle Check Balance (Verify Password)
app.post("/check-balance", (req, res) => {
    const { accountNumber, password } = req.body;
    let users = loadUsers();
    const bst = loadUsersIntoBST();  
const user = bst.search(accountNumber);

    if (!user || user.password !== password) {
        return res.status(400).json({ success: false, message: "Invalid accountNumber or password!" });
    }

    res.json({ success: true, balance: users[accountNumber].balance });
});

app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});
