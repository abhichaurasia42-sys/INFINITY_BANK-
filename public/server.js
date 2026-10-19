const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, "users.json");

// ──────────────────────────────────────────────
// Terminal Logger Helpers
// ──────────────────────────────────────────────
function getTimestamp() {
    return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function logInfo(tag, message) {
    console.log(`[${getTimestamp()}] ℹ️  [${tag}] ${message}`);
}

function logSuccess(tag, message, details = null) {
    console.log(`[${getTimestamp()}] ✅ [${tag}] ${message}`);
    if (details) {
        console.log(`           ${JSON.stringify(details)}`);
    }
}

function logWarn(tag, message, details = null) {
    console.log(`[${getTimestamp()}] ⚠️  [${tag}] ${message}`);
    if (details) {
        console.log(`           ${JSON.stringify(details)}`);
    }
}

function logError(tag, message, error = null) {
    console.error(`[${getTimestamp()}] ❌ [${tag}] ${message}`);
    if (error) {
        console.error(`           Error:`, error);
    }
}

// ──────────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────────
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Request logging middleware for API calls
app.use((req, res, next) => {
    // Exclude static assets (.css, .js, .webp, .jpg, .ico) from terminal spam
    if (!req.path.match(/\.(css|js|webp|jpg|jpeg|png|svg|ico|map)$/i)) {
        console.log(`[${getTimestamp()}] 🌐 HTTP ${req.method} ${req.originalUrl}`);
    }
    next();
});

// Expose public config (Supabase anon key is safe to expose to the browser)
app.get("/config", (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// ──────────────────────────────────────────────
// User Storage & Database Helpers
// ──────────────────────────────────────────────
// Load users from file
function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch (err) {
        logWarn("DATABASE", "users.json missing or invalid, returning empty store.");
        return {};
    }
}

// Save users to file
function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    } catch (err) {
        logError("DATABASE", "Failed writing to users.json", err.message);
    }
}

// Find user by account number (checks local store, then queries Supabase fallback)
async function findUser(users, acc) {
    if (!acc) return null;
    const strAcc = String(acc).trim();
    if (users[strAcc]) return users[strAcc];
    for (const key of Object.keys(users)) {
        const u = users[key];
        if (key.trim() === strAcc || (u.accountNumber && String(u.accountNumber).trim() === strAcc) || (u.id && String(u.id).trim() === strAcc)) {
            return u;
        }
    }

    // Fallback: Query Supabase
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
        if (!SUPABASE_URL || !SUPABASE_ANON) return null;

        const r = await fetch(`${SUPABASE_URL}/rest/v1/users?or=(account_number.eq.${encodeURIComponent(strAcc)},id.eq.${encodeURIComponent(strAcc)})&select=*`, {
            headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
        });
        if (r.ok) {
            const data = await r.json();
            if (data && data.length > 0) {
                const row = data[0];
                return {
                    accountNumber: row.account_number || row.id,
                    name: row.name,
                    email: row.email,
                    balance: row.balance || 0,
                    password: row.password,
                    cardNumber: row.card_number,
                    transactions: row.transactions || []
                };
            }
        }
    } catch (err) {
        logError("SUPABASE", "Error fetching user from Supabase", err.message);
    }

    return null;
}

// Sync balance and transactions to Supabase whenever updated
async function syncUserToSupabase(user) {
    if (!user) return;
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
        if (!SUPABASE_URL || !SUPABASE_ANON) return;

        const acc = String(user.accountNumber || user.id).trim();
        await fetch(`${SUPABASE_URL}/rest/v1/users?or=(account_number.eq.${encodeURIComponent(acc)},id.eq.${encodeURIComponent(acc)})`, {
            method: "PATCH",
            headers: {
                apikey: SUPABASE_ANON,
                Authorization: `Bearer ${SUPABASE_ANON}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal"
            },
            body: JSON.stringify({
                balance: user.balance,
                transactions: user.transactions || []
            })
        });
        logInfo("SUPABASE", `Synced account ${acc} to Supabase`);
    } catch (err) {
        logError("SUPABASE", "Sync error", err.message);
    }
}

// ──────────────────────────────────────────────
// Binary Search Tree (BST) for Quick Account Lookup
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Brevo Transactional Email Service (via REST API)
// ──────────────────────────────────────────────
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendBrevoEmail(to, toName, subject, textContent, htmlContent = null) {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || "Infinity Bank";

    if (!apiKey || !senderEmail) {
        logError("BREVO", "BREVO_API_KEY or BREVO_SENDER_EMAIL is missing in .env!");
        return false;
    }

    const payload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to, name: toName || to }],
        subject: subject,
        textContent: textContent
    };

    if (htmlContent) {
        payload.htmlContent = htmlContent;
    }

    try {
        logInfo("BREVO", `Sending email to "${to}" [Subject: "${subject}"]`);
        const res = await fetch(BREVO_API_URL, {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": apiKey,
                "content-type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            logSuccess("BREVO", `Email sent successfully to "${to}"`, {
                subject,
                messageId: data.messageId || "sent"
            });
            return true;
        } else {
            const err = await res.json().catch(() => ({}));
            logError("BREVO", `Brevo API returned error status ${res.status}`, err);
            return false;
        }
    } catch (error) {
        logError("BREVO", `Exception while communicating with Brevo API: ${error.message}`);
        return false;
    }
}

// Send OTP email with styled Brevo template
async function sendOTPviaEmail(name, email, otp) {
    const displayName = name || "Valued Customer";
    logInfo("OTP", `Preparing OTP email for ${displayName} (${email}) -> OTP: [ ${otp} ]`);
    const subject = `Infinity Bank - Security Verification OTP: ${otp}`;
    const textContent = `Dear ${displayName},\n\nYour One-Time Password (OTP) is: ${otp}\n\nThis OTP is valid for 5 minutes. Do not share it with anyone.\n\n— Infinity Bank Security Team`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#0b1329;font-family:'Segoe UI',Arial,sans-serif;color:#f0f4f8;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1329;padding:30px 15px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#111e38;border:1px solid rgba(212,175,55,0.4);border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
              <tr>
                <td style="background:linear-gradient(135deg,#0b1329 0%,#1a2a4e 100%);padding:25px;text-align:center;border-bottom:2px solid #d4af37;">
                  <h1 style="margin:0;color:#d4af37;font-size:24px;letter-spacing:2px;">🏦 INFINITY BANK</h1>
                  <p style="margin:5px 0 0;color:#94a3b8;font-size:13px;">Security & Verification Services</p>
                </td>
              </tr>
              <tr>
                <td style="padding:30px;">
                  <p style="font-size:16px;color:#e2e8f0;margin-top:0;">Dear <strong>${displayName}</strong>,</p>
                  <p style="font-size:14px;color:#cbd5e1;line-height:1.6;">Use the one-time code below to authenticate your request. This code is valid for <strong>5 minutes</strong>.</p>
                  
                  <div style="text-align:center;margin:30px 0;">
                    <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:8px;color:#d4af37;background:#0b1329;padding:14px 28px;border:2px dashed #d4af37;border-radius:8px;">
                      ${otp}
                    </span>
                  </div>

                  <p style="font-size:13px;color:#f87171;line-height:1.5;">⚠️ <strong>Never share this code:</strong> Infinity Bank will never call, text, or email you asking for your OTP.</p>
                </td>
              </tr>
              <tr>
                <td style="background:#0b1329;padding:20px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;color:#64748b;">
                  © ${new Date().getFullYear()} Infinity Bank Ltd. Delivered via Brevo.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    return await sendBrevoEmail(email, displayName, subject, textContent, htmlContent);
}

// Send transactional notifications via Brevo
async function sendNotificationEmail(to, subject, textContent) {
    if (!to) {
        logWarn("BREVO", "Cannot send notification email: recipient address is empty.");
        return false;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#0b1329;font-family:'Segoe UI',Arial,sans-serif;color:#f0f4f8;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1329;padding:30px 15px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#111e38;border:1px solid rgba(212,175,55,0.4);border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
              <tr>
                <td style="background:linear-gradient(135deg,#0b1329 0%,#1a2a4e 100%);padding:25px;text-align:center;border-bottom:2px solid #d4af37;">
                  <h1 style="margin:0;color:#d4af37;font-size:24px;letter-spacing:2px;">🏦 INFINITY BANK</h1>
                  <p style="margin:5px 0 0;color:#94a3b8;font-size:13px;">Official Account Notification</p>
                </td>
              </tr>
              <tr>
                <td style="padding:30px;">
                  <h2 style="color:#d4af37;font-size:18px;margin-top:0;">${subject}</h2>
                  <div style="font-size:14px;color:#cbd5e1;line-height:1.8;white-space:pre-line;background:#0b1329;padding:18px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
                    ${textContent}
                  </div>
                  <p style="font-size:13px;color:#94a3b8;margin-top:20px;">For any questions regarding this notification, please access your online dashboard or reach out to customer support.</p>
                </td>
              </tr>
              <tr>
                <td style="background:#0b1329;padding:20px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;color:#64748b;">
                  © ${new Date().getFullYear()} Infinity Bank Ltd. Delivered via Brevo.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    return await sendBrevoEmail(to, "", subject, textContent, htmlContent);
}

// ──────────────────────────────────────────────
// Helpers & OTP Store
// ──────────────────────────────────────────────
const OTP_STORE = {};

function generateUniqueNumber(length) {
    return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ──────────────────────────────────────────────
// API Endpoints
// ──────────────────────────────────────────────

// 🔐 LOGIN
app.post("/login", (req, res) => {
    const { accountNumber, password } = req.body;
    logInfo("LOGIN", `Attempt for account: "${accountNumber}"`);
    const bst = loadUsersIntoBST();
    if (!bst) {
        logError("LOGIN", "User database failed to load into BST.");
        return res.json({ success: false, message: "Server error." });
    }

    const user = bst.search(accountNumber);
    if (!user) {
        logWarn("LOGIN", `Account "${accountNumber}" not found. Redirecting to registration.`);
        return res.json({ success: false, message: "Account not found!", redirect: "code3.html" });
    }
    if (user.password !== password) {
        logWarn("LOGIN", `Incorrect password for account "${accountNumber}"`);
        return res.json({ success: false, message: "Incorrect password!" });
    }

    logSuccess("LOGIN", `Login successful for "${user.name}" (Account: ${accountNumber})`);
    res.json({ success: true, message: `Welcome, ${user.name}!`, redirect: "code4.html", ...user });
});

// 🧾 REGISTER
app.post("/register", (req, res) => {
    const { name, dob, aadhaar, phone, email, address, password } = req.body;
    logInfo("REGISTER", `New account registration request: ${name} (${email})`);
    let users = loadUsers();
    const accountNumber = generateUniqueNumber(15);
    const cardNumber = generateUniqueNumber(16);

    if (Object.values(users).some(u => u.email === email)) {
        logWarn("REGISTER", `Registration declined: Email "${email}" is already registered.`);
        return res.json({ success: false, message: "Email already in use!" });
    }

    users[accountNumber] = { name, dob, aadhaar, phone, email, address, password, cardNumber, balance: 0, transactions: [] };
    saveUsers(users);
    logSuccess("REGISTER", `Account registered! Acc#: ${accountNumber} | Card#: ${cardNumber} | Owner: ${name}`);

    sendNotificationEmail(
        email,
        "Welcome to INFINITY BANK",
        `Dear ${name},\n\nYou have successfully created your account in INFINITY BANK on ${new Date().toLocaleString()}!\n\nAccount Number: ${accountNumber}\nCard Number: ${cardNumber}\n\nPlease save these details for your future reference.`
    );

    res.json({ success: true, message: "Account created!", name: name, accountNumber: accountNumber });
});

// 📩 REQUEST OTP (FOR TRANSACTIONS / ACCOUNT ACTIONS)
app.post("/request-otp", async (req, res) => {
    const { accountNumber } = req.body;
    logInfo("OTP REQUEST", `Incoming OTP request for account: "${accountNumber}"`);
    const users = loadUsers();
    const user = await findUser(users, accountNumber);

    if (!user) {
        logWarn("OTP REQUEST", `User not found for account: "${accountNumber}"`);
        return res.json({ success: false, message: "User not found!" });
    }

    const accKey = String(user.accountNumber || accountNumber);
    const otp = generateOTP();
    OTP_STORE[accKey] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    if (accountNumber && accountNumber !== accKey) {
        OTP_STORE[String(accountNumber)] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    }

    logInfo("OTP GENERATED", `Account: ${accKey} | Recipient Email: ${user.email} | OTP: [ ${otp} ]`);
    const sent = await sendOTPviaEmail(user.name, user.email, otp);
    if (sent) {
        logSuccess("OTP REQUEST", `OTP successfully delivered via Brevo to ${user.email}`);
        res.json({ success: true, message: "OTP sent to your registered email!" });
    } else {
        logWarn("OTP REQUEST", `Brevo delivery failed for ${user.email}. Displaying OTP fallback.`);
        res.json({ 
            success: true, 
            message: `OTP generated (Dev Mode: ${otp}). Brevo email delivery failed; check terminal logs.`
        });
    }
});

// 📩 REQUEST EMAIL OTP (FOR NEW REGISTRATION)
app.post("/request-email-otp", async (req, res) => {
    const { name, email } = req.body;
    logInfo("EMAIL OTP", `Registration OTP request for: ${name || 'Prospective User'} (${email})`);

    if (!email) {
        logWarn("EMAIL OTP", "Request missing required email field.");
        return res.json({ success: false, message: "Email is required" });
    }

    const users = loadUsers();
    const userExists = Object.values(users).some(user => user.email === email);

    if (userExists) {
        logWarn("EMAIL OTP", `Registration blocked: ${email} already registered.`);
        return res.json({ 
            success: false, 
            message: "Email already registered. Please use a different email." 
        });
    }

    const otp = generateOTP();
    OTP_STORE[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    logInfo("OTP GENERATED", `Registration Email: ${email} | OTP: [ ${otp} ]`);

    const sent = await sendOTPviaEmail(name, email, otp);
    if (sent) {
        logSuccess("EMAIL OTP", `OTP delivered via Brevo to ${email}`);
        return res.json({ success: true, message: "OTP sent!" });
    } else {
        logWarn("EMAIL OTP", `Brevo delivery failed for ${email}`);
        return res.json({ 
            success: true, 
            message: `OTP generated (Dev Mode: ${otp}). Brevo delivery failed; check terminal logs.` 
        });
    }
});

// 🔍 VERIFY EMAIL OTP
app.post("/verify-email-otp", (req, res) => {
    const { email, otp } = req.body;
    logInfo("VERIFY EMAIL OTP", `Validating OTP for email: ${email} (Input: ${otp})`);
    if (!OTP_STORE[email] || OTP_STORE[email].otp !== String(otp).trim() || OTP_STORE[email].expires < Date.now()) {
        logWarn("VERIFY EMAIL OTP", `Invalid or expired OTP for email ${email}`);
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }
    delete OTP_STORE[email];
    logSuccess("VERIFY EMAIL OTP", `Email ${email} verified successfully!`);
    res.json({ success: true, message: "OTP verified!" });
});

// 💸 TRANSACTION (DEPOSIT / WITHDRAW)
app.post("/transaction", async (req, res) => {
    const { accountNumber, type, amount, otp } = req.body;
    const numAmount = parseFloat(amount) || 0;
    logInfo("TRANSACTION", `Request: ${type?.toUpperCase()} ₹${numAmount} for Account: "${accountNumber}"`);
    let users = loadUsers();
    let user = await findUser(users, accountNumber);

    if (!user) {
        logWarn("TRANSACTION", `User not found: "${accountNumber}"`);
        return res.json({ success: false, message: "User not found!" });
    }

    const accKey = String(user.accountNumber || accountNumber).trim();
    const reqKey = String(accountNumber || "").trim();
    const storedOtp = OTP_STORE[accKey] || OTP_STORE[reqKey];

    if (!storedOtp || storedOtp.otp !== String(otp).trim() || storedOtp.expires < Date.now()) {
        logWarn("TRANSACTION", `OTP validation failed for account: ${accKey}`);
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }

    const prevBalance = user.balance || 0;

    if (type === "deposit") {
        user.balance = prevBalance + numAmount;
        user.transactions = user.transactions || [];
        user.transactions.push(`${new Date().toLocaleString()} - Deposited ₹${numAmount}`);
        users[accKey] = user;
        saveUsers(users);
        await syncUserToSupabase(user);

        logSuccess("DEPOSIT", `Acc ${accKey}: Deposited ₹${numAmount}. Previous: ₹${prevBalance} -> New Balance: ₹${user.balance}`);

        sendNotificationEmail(
            user.email,
            "Deposit Confirmation - INFINITY BANK",
            `Account Number ${accKey} has been CREDITED with ₹${numAmount} on ${new Date().toLocaleString()}.\n\nCredited Amount: ₹${numAmount}\nCurrent Balance: ₹${user.balance}`
        );
    } else if (type === "withdraw") {
        if (prevBalance < numAmount) {
            logWarn("WITHDRAW", `Insufficient balance for Acc ${accKey}. Available: ₹${prevBalance}, Required: ₹${numAmount}`);
            return res.json({ success: false, message: "Insufficient balance!" });
        }
        user.balance = prevBalance - numAmount;
        user.transactions = user.transactions || [];
        user.transactions.push(`${new Date().toLocaleString()} - Withdrew ₹${numAmount}`);
        users[accKey] = user;
        saveUsers(users);
        await syncUserToSupabase(user);

        logSuccess("WITHDRAW", `Acc ${accKey}: Withdrew ₹${numAmount}. Previous: ₹${prevBalance} -> New Balance: ₹${user.balance}`);

        sendNotificationEmail(
            user.email,
            "Withdrawal Alert - INFINITY BANK",
            `Account Number ${accKey} has been DEBITED with ₹${numAmount} on ${new Date().toLocaleString()}.\n\nDebited Amount: ₹${numAmount}\nCurrent Balance: ₹${user.balance}`
        );
    } else {
        logWarn("TRANSACTION", `Unknown transaction type: "${type}"`);
        return res.json({ success: false, message: "Unknown transaction type." });
    }

    delete OTP_STORE[accKey];
    delete OTP_STORE[reqKey];
    res.json({ success: true, balance: user.balance, transactions: user.transactions, message: "Transaction Successful" });
});

// 🔁 RECHARGE
app.post("/recharge", async (req, res) => {
    const { accountNumber, amount, otp } = req.body;
    const numAmount = parseFloat(amount) || 0;
    logInfo("RECHARGE", `Recharge request: Acc "${accountNumber}" | Amount: ₹${numAmount}`);
    const users = loadUsers();
    const user = await findUser(users, accountNumber);

    if (!user) {
        logWarn("RECHARGE", `User not found: "${accountNumber}"`);
        return res.json({ success: false, message: "User not found!" });
    }

    const accKey = String(user.accountNumber || accountNumber).trim();
    const reqKey = String(accountNumber || "").trim();
    const storedOtp = OTP_STORE[accKey] || OTP_STORE[reqKey];

    if (!storedOtp || storedOtp.otp !== String(otp).trim() || storedOtp.expires < Date.now()) {
        logWarn("RECHARGE", `Invalid or expired OTP for account: ${accKey}`);
        return res.json({ success: false, message: "Invalid OTP or user not found!" });
    }

    if ((user.balance || 0) < numAmount) {
        logWarn("RECHARGE", `Insufficient funds for recharge: Current balance ₹${user.balance}, needed ₹${numAmount}`);
        return res.json({ success: false, message: "Insufficient balance!" });
    }

    user.balance = (user.balance || 0) - numAmount;
    user.transactions = user.transactions || [];
    user.transactions.push(`${new Date().toLocaleString()} - Recharge for ₹${numAmount}`);
    users[accKey] = user;
    saveUsers(users);
    await syncUserToSupabase(user);

    logSuccess("RECHARGE", `Recharge successful! Acc: ${accKey} debited ₹${numAmount}. New balance: ₹${user.balance}`);

    sendNotificationEmail(
        user.email,
        "Recharge Notification - INFINITY BANK",
        `Account Number ${accKey} has been DEBITED with ₹${numAmount} on ${new Date().toLocaleString()} for Mobile/DTH Recharge.\n\nDebited Amount: ₹${numAmount}\nCurrent Balance: ₹${user.balance}`
    );
    
    delete OTP_STORE[accKey];
    delete OTP_STORE[reqKey];

    res.json({ success: true, message: "Recharge done", newBalance: user.balance });
});

// 📋 GET TRANSACTIONS
app.get("/transactions", async (req, res) => {
    const accountNumber = req.query.accountNumber;
    logInfo("TRANSACTIONS", `History requested for account: "${accountNumber}"`);
    const users = loadUsers();
    const user = await findUser(users, accountNumber);
    if (!user) {
        logWarn("TRANSACTIONS", `User not found: "${accountNumber}"`);
        return res.json({ success: false, message: "User not found!" });
    }
    logSuccess("TRANSACTIONS", `Returning ${(user.transactions || []).length} transactions for account: ${accountNumber}`);
    res.json({ success: true, balance: user.balance, transactions: user.transactions || [] });
});

// 💳 GET CARD DETAILS
app.post("/get-card-details", async (req, res) => {
    const { accountNumber, password } = req.body;
    logInfo("CARD DETAILS", `Fetching card info for account: "${accountNumber}"`);
    const users = loadUsers();
    const user = await findUser(users, accountNumber);

    if (!user || user.password !== password) {
        logWarn("CARD DETAILS", `Invalid credentials for account: "${accountNumber}"`);
        return res.json({ success: false, message: "Invalid credentials!" });
    }

    logSuccess("CARD DETAILS", `Card details served for "${user.name}"`);
    res.json({ success: true, name: user.name, cardNumber: user.cardNumber, expiry: "12/28" });
});

// 👤 GET USER DETAILS
app.get("/getUserDetails", async (req, res) => {
    const { accountNumber } = req.query;
    logInfo("USER DETAILS", `Profile requested for account: "${accountNumber}"`);
    let users = loadUsers();
    const user = await findUser(users, accountNumber);

    if (!user) {
        logWarn("USER DETAILS", `User not found: "${accountNumber}"`);
        return res.status(400).json({ success: false, message: "User not found!" });
    }

    const { name, email, cardNumber, address, dob, balance } = user;
    logSuccess("USER DETAILS", `Profile sent for ${name} (${email})`);
    res.json({ success: true, name, email, accountNumber: user.accountNumber, cardNumber, address, dob, balance });
});

// 🔍 VERIFY PASSWORD
app.post("/verify-password", async (req, res) => {
    const { accountNumber, password } = req.body;
    logInfo("VERIFY PASSWORD", `Checking password for account: "${accountNumber}"`);
    const users = loadUsers();
    const user = await findUser(users, accountNumber);

    if (!user || user.password !== password) {
        logWarn("VERIFY PASSWORD", `Incorrect password for account: "${accountNumber}"`);
        return res.json({ success: false, message: "Incorrect password!" });
    }

    logSuccess("VERIFY PASSWORD", `Password verified for account: "${accountNumber}"`);
    res.json({ success: true, accountNumber: user.accountNumber });
});

// 🧾 BILL PAYMENT
app.post("/pay-bill", async (req, res) => {
    const { accountNumber, billType, billNumber, amount, otp } = req.body;
    const numAmount = parseFloat(amount) || 0;
    logInfo("BILL PAYMENT", `Account: "${accountNumber}" | Type: ${billType} | #${billNumber} | ₹${numAmount}`);
    const users = loadUsers();
    const user = await findUser(users, accountNumber);

    if (!user) {
        logWarn("BILL PAYMENT", `User not found: "${accountNumber}"`);
        return res.json({ success: false, message: "User not found!" });
    }

    const accKey = String(user.accountNumber || accountNumber).trim();
    const reqKey = String(accountNumber || "").trim();
    const storedOtp = OTP_STORE[accKey] || OTP_STORE[reqKey];

    if (!storedOtp || storedOtp.otp !== String(otp).trim() || storedOtp.expires < Date.now()) {
        logWarn("BILL PAYMENT", `Invalid or expired OTP for account: ${accKey}`);
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }

    if ((user.balance || 0) < numAmount) {
        logWarn("BILL PAYMENT", `Insufficient balance for bill payment: Current ₹${user.balance}, needed ₹${numAmount}`);
        return res.json({ success: false, message: "Insufficient balance!" });
    }

    user.balance = (user.balance || 0) - numAmount;
    user.transactions = user.transactions || [];
    user.transactions.push(`${new Date().toLocaleString()} - Paid ₹${numAmount} for ${billType} bill #${billNumber}`);
    users[accKey] = user;
    saveUsers(users);
    await syncUserToSupabase(user);

    logSuccess("BILL PAYMENT", `Bill payment completed! Acc: ${accKey} debited ₹${numAmount}. New balance: ₹${user.balance}`);

    sendNotificationEmail(
        user.email,
        "Bill Payment Confirmation - INFINITY BANK",
        `Account Number ${accKey} has been DEBITED with ₹${numAmount} on ${new Date().toLocaleString()} for ${billType} bill #${billNumber}.\n\nDebited Amount: ₹${numAmount}\nCurrent Balance: ₹${user.balance}`
    );

    delete OTP_STORE[accKey];
    delete OTP_STORE[reqKey];
    res.json({ success: true, message: "Bill paid successfully!", newBalance: user.balance });
});

// 🔐 FORGOT PASSWORD - REQUEST OTP
app.post("/forgot-password-request", async (req, res) => {
    const { accountNumber } = req.body;
    logInfo("FORGOT PASSWORD", `Reset OTP requested for account: "${accountNumber}"`);
    const users = loadUsers();
    const user = await findUser(users, accountNumber);
    if (!user) {
        logWarn("FORGOT PASSWORD", `Account not found: "${accountNumber}"`);
        return res.json({ success: false, message: "Account not found!" });
    }

    const otp = generateOTP();
    OTP_STORE[accountNumber] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    logInfo("OTP GENERATED", `Forgot Password OTP for ${accountNumber} (${user.email}): [ ${otp} ]`);

    const sent = await sendOTPviaEmail(user.name, user.email, otp);
    if (sent) {
        logSuccess("FORGOT PASSWORD", `OTP dispatched via Brevo to ${user.email}`);
        res.json({ success: true, message: "OTP sent!" });
    } else {
        logWarn("FORGOT PASSWORD", `Brevo failed for ${user.email}`);
        res.json({ success: true, message: `OTP generated (Dev Mode: ${otp}). Brevo delivery failed; check terminal logs.` });
    }
});

// 🔐 VERIFY OTP
app.post("/verify-otp", (req, res) => {
    const { accountNumber, otp } = req.body;
    logInfo("VERIFY OTP", `Validating OTP for account: "${accountNumber}" (Input: ${otp})`);
    if (!OTP_STORE[accountNumber] || OTP_STORE[accountNumber].otp !== String(otp).trim() || OTP_STORE[accountNumber].expires < Date.now()) {
        logWarn("VERIFY OTP", `Invalid or expired OTP for account: "${accountNumber}"`);
        return res.json({ success: false, message: "Invalid or expired OTP!" });
    }
    delete OTP_STORE[accountNumber];
    logSuccess("VERIFY OTP", `OTP verified for account: "${accountNumber}"`);
    res.json({ success: true, message: "OTP verified!" });
});

// 🔑 CHANGE PASSWORD
app.post("/change-password", async (req, res) => {
    const { accountNumber, newPassword } = req.body;
    const acc = String(accountNumber).trim();
    logInfo("CHANGE PASSWORD", `Password reset attempt for account: "${acc}"`);
    const users = loadUsers();

    if (!users[acc] || !newPassword) {
        logWarn("CHANGE PASSWORD", `Invalid account or empty password for "${acc}"`);
        return res.json({ success: false, message: "Enter a valid account number and new password." });
    }

    users[acc].password = newPassword;
    saveUsers(users);
    await syncUserToSupabase(users[acc]);
    logSuccess("CHANGE PASSWORD", `Password successfully changed for account: "${acc}"`);

    res.json({ success: true, message: "Password changed successfully" });
});

// 👥 VERIFY RECIPIENT
app.post("/verify-recipient", async (req, res) => {
    const { accountNumber, recipientAccount } = req.body;
    logInfo("RECIPIENT LOOKUP", `Sender "${accountNumber}" verifying recipient "${recipientAccount}"`);
  
    const users = loadUsers();
    if (String(accountNumber).trim() === String(recipientAccount).trim()) {
        logWarn("RECIPIENT LOOKUP", "Self-transfer is disallowed.");
        return res.json({ success: false, message: "Self Transfer is Unavailable" });
    }
  
    const recipient = await findUser(users, recipientAccount);
    if (!recipient) {
        logWarn("RECIPIENT LOOKUP", `Recipient not found: "${recipientAccount}"`);
        return res.json({ success: false, message: "Recipient not found." });
    }
  
    logSuccess("RECIPIENT LOOKUP", `Recipient found: ${recipient.name} (Account: ${recipientAccount})`);
    return res.json({ success: true, name: recipient.name });
});

// 💸 SEND MONEY (ACCOUNT TO ACCOUNT TRANSFER)
app.post("/send-money", async (req, res) => {
    const { accountNumber, recipientAccount, amount, otp } = req.body;
    const users = loadUsers();
    const strAcc = String(accountNumber).trim();
    const strRecip = String(recipientAccount).trim();
    const numAmount = parseFloat(amount) || 0;

    logInfo("SEND MONEY", `Transfer: ₹${numAmount} from "${strAcc}" to "${strRecip}" (OTP: ${otp})`);
  
    if (!OTP_STORE[strAcc] || OTP_STORE[strAcc].otp !== String(otp).trim() || OTP_STORE[strAcc].expires < Date.now()) {
        logWarn("SEND MONEY", `Transfer rejected: Invalid or expired OTP for "${strAcc}"`);
        return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
    }
  
    const sender = await findUser(users, strAcc);
    const receiver = await findUser(users, strRecip);
  
    if (!sender || !receiver) {
        logWarn("SEND MONEY", "Transfer rejected: Sender or recipient account not found.");
        return res.status(400).json({ success: false, message: "Invalid accounts." });
    }
  
    if (isNaN(numAmount) || numAmount <= 0) {
        logWarn("SEND MONEY", `Transfer rejected: Invalid amount ${numAmount}`);
        return res.status(400).json({ success: false, message: "Invalid amount." });
    }
  
    if ((sender.balance || 0) < numAmount) {
        logWarn("SEND MONEY", `Transfer rejected: Insufficient balance. Available: ₹${sender.balance}, Required: ₹${numAmount}`);
        return res.status(400).json({ success: false, message: "Insufficient balance." });
    }
  
    sender.balance -= numAmount;
    receiver.balance = (receiver.balance || 0) + numAmount;
  
    sender.transactions = sender.transactions || [];
    receiver.transactions = receiver.transactions || [];
    sender.transactions.push(`${new Date().toLocaleString()} - Sent ₹${numAmount} to ${receiver.name}`);
    receiver.transactions.push(`${new Date().toLocaleString()} - Received ₹${numAmount} from ${sender.name}`);
    
    users[strAcc] = sender;
    users[strRecip] = receiver;
    saveUsers(users);
    await syncUserToSupabase(sender);
    await syncUserToSupabase(receiver);

    logSuccess("SEND MONEY", `Transfer of ₹${numAmount} completed!`);
    logSuccess("SEND MONEY", `Sender "${sender.name}" (${strAcc}) new balance: ₹${sender.balance}`);
    logSuccess("SEND MONEY", `Receiver "${receiver.name}" (${strRecip}) new balance: ₹${receiver.balance}`);

    // Send notification emails via Brevo
    sendNotificationEmail(
        sender.email,
        "Debit Alert - Money Sent",
        `Dear ${sender.name},\n\nAccount Number ${sender.accountNumber || strAcc} has transferred ₹${numAmount} to ${receiver.name} on ${new Date().toLocaleString()}.\n\nDebited Amount: ₹${numAmount}\nCurrent Balance: ₹${sender.balance}`
    );
    sendNotificationEmail(
        receiver.email,
        "Credit Alert - Money Received",
        `Dear ${receiver.name},\n\nAccount Number ${receiver.accountNumber || strRecip} has received ₹${numAmount} from ${sender.name} on ${new Date().toLocaleString()}.\n\nCredited Amount: ₹${numAmount}\nCurrent Balance: ₹${receiver.balance}`
    );
  
    delete OTP_STORE[strAcc];
    res.json({ success: true, message: "Transaction successful." });
});

// 💰 CHECK BALANCE (VERIFY PASSWORD)
app.post("/check-balance", async (req, res) => {
    const { accountNumber, password } = req.body;
    logInfo("CHECK BALANCE", `Balance enquiry for account: "${accountNumber}"`);
    let users = loadUsers();
    const bst = loadUsersIntoBST();  
    const user = bst ? bst.search(accountNumber) : await findUser(users, accountNumber);

    if (!user || user.password !== password) {
        logWarn("CHECK BALANCE", `Enquiry failed: Invalid accountNumber or password for "${accountNumber}"`);
        return res.status(400).json({ success: false, message: "Invalid accountNumber or password!" });
    }

    logSuccess("CHECK BALANCE", `Account: "${accountNumber}" current balance: ₹${user.balance}`);
    res.json({ success: true, balance: user.balance });
});

// ──────────────────────────────────────────────
// Server Startup Banner
// ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
    const apiKeyStatus = process.env.BREVO_API_KEY ? "CONFIGURED (Active)" : "❌ NOT FOUND";
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "Not set";
    const senderName = process.env.BREVO_SENDER_NAME || "Infinity Bank";

    console.log("\n=================================================================");
    console.log("            🏦 INFINITY BANK MANAGEMENT SYSTEM SERVER            ");
    console.log("=================================================================");
    console.log(` 🌐 Server URL:     http://localhost:${PORT}`);
    console.log(` 📧 Email Engine:   Brevo Transactional API`);
    console.log(` 🔑 Brevo API Key:  ${apiKeyStatus}`);
    console.log(` ✉️  Brevo Sender:   ${senderName} <${senderEmail}>`);
    console.log(` 💾 Local Storage:  ${USERS_FILE}`);
    console.log(` ☁️  Supabase URL:   ${process.env.SUPABASE_URL ? process.env.SUPABASE_URL : "Disabled (Local JSON Only)"}`);
    console.log("=================================================================");
    console.log(" ✅ Ready to accept banking transactions & dispatch Brevo emails.\n");
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error("\n=================================================================");
        console.error(` ❌ [PORT CONFLICT] Port ${PORT} is already in use by another process!`);
        console.error("=================================================================");
        console.error(` 👉 To free port ${PORT} on Windows PowerShell, run:`);
        console.error(`    Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
        console.error(` 👉 Or run on another port by setting PORT (e.g. PORT=3001)`);
        console.error("=================================================================\n");
        process.exit(1);
    } else {
        console.error("Server error:", err);
        process.exit(1);
    }
});
