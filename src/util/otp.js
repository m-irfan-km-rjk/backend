import json from "./json";
import { hashPassword } from "./hash";

// 🔐 Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 🔐 Hash OTP
async function hashOTP(otp) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(otp)
    );
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function sendOTP(req, env) {

    const { email } = await req.json();
    if (!email) return json({ error: "Email required" }, 400);

    const now = Date.now();

    // 🔴 Rate limit (1 request per 60 sec)
    const recent = await env.cldb.prepare(`
        SELECT created_at FROM otps 
        WHERE email = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).bind(email).first();

    if (recent && now - recent.created_at < 60 * 1000) {
        return json({
            success: false,
            message: "Too many requests. Try again in a minute."
        }, 429);
    }

    // 🔥 Delete old OTPs for this email (important)
    await env.cldb.prepare(`
        DELETE FROM otps WHERE email = ?
    `).bind(email).run();

    // 🔢 Generate + hash OTP
    const otp = generateOTP();
    const hashedOtp = await hashOTP(otp);

    const expiresAt = now + 5 * 60 * 1000; // 5 min

    // 💾 Store OTP
    await env.cldb.prepare(`
        INSERT INTO otps (id, email, otp_hash, expires_at, created_at, attempts)
        VALUES (?, ?, ?, ?, ?, 0)
    `).bind(
        crypto.randomUUID(),
        email,
        hashedOtp,
        expiresAt,
        now
    ).run();

    // ✉️ Send email (Resend)
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: "noreply@crescentlearning.org",
            to: email,
            subject: "Your OTP Code",
            html: `
                <div style="font-family: sans-serif;">
                    <h2>Your OTP is: ${otp}</h2>
                    <p>This OTP is valid for 5 minutes.</p>
                </div>
            `
        })
    });

    const data = await res.json();

    if (!res.ok) {
        return json({
            success: false,
            message: "Failed to send email",
            error: data
        }, 500);
    }

    return json({
        success: true,
        message: "OTP sent successfully"
    });
}

export async function verifyOTP(req, env) {
    await env.cldb.prepare(`
    DELETE FROM otps WHERE expires_at < ?
`).bind(Date.now()).run();

    const { email, otp } = await req.json();

    if (!email || !otp) {
        return json({ error: "Email and OTP required" }, 400);
    }

    const now = Date.now();

    const record = await env.cldb.prepare(`
        SELECT id, otp_hash, expires_at, attempts
        FROM otps
        WHERE email = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).bind(email).first();

    if (!record) {
        return json({
            success: false,
            message: "OTP not found"
        }, 400);
    }

    // ⏱️ Expiry check
    if (now > record.expires_at) {
        await env.cldb.prepare(
            "DELETE FROM otps WHERE id = ?"
        ).bind(record.id).run();

        return json({
            success: false,
            message: "OTP expired"
        }, 400);
    }

    // 🚫 Attempt limit (max 5 tries)
    if (record.attempts >= 5) {
        await env.cldb.prepare(
            "DELETE FROM otps WHERE id = ?"
        ).bind(record.id).run();

        return json({
            success: false,
            message: "Too many attempts. Request a new OTP."
        }, 429);
    }

    const hashedInput = await hashOTP(otp);

    if (record.otp_hash !== hashedInput) {
        // ❌ increment attempts
        await env.cldb.prepare(`
            UPDATE otps 
            SET attempts = attempts + 1 
            WHERE id = ?
        `).bind(record.id).run();

        return json({
            success: false,
            message: "Invalid OTP"
        }, 401);
    }

    // delete OTP
    await env.cldb.prepare(
        "DELETE FROM otps WHERE id = ?"
    ).bind(record.id).run();

    // remove old reset tokens
    await env.cldb.prepare(`
    DELETE FROM password_resets WHERE email = ?
`).bind(email).run();

    // create new reset token
    const resetToken = crypto.randomUUID();

    await env.cldb.prepare(`
    INSERT INTO password_resets (id, email, expires_at)
    VALUES (?, ?, ?)
`).bind(
        resetToken,
        email,
        Date.now() + 10 * 60 * 1000
    ).run();

    return json({
        success: true,
        message: "OTP verified successfully",
        reset_token: resetToken
    });
}

export async function resetPassword(req, env) {
    const { email, new_password, reset_token } = await req.json();

    if (!email || !new_password || !reset_token) {
        return json({ error: "Missing fields" }, 400);
    }

    const record = await env.cldb.prepare(`
        SELECT * FROM password_resets
        WHERE id = ? AND email = ?
    `).bind(reset_token, email).first();

    if (!record) {
        return json({ error: "Invalid token" }, 400);
    }

    if (Date.now() > record.expires_at) {
        return json({ error: "Token expired" }, 400);
    }

    // 🔐 hash password (IMPORTANT)
    const hashedPassword = await hashPassword(new_password);

    await env.cldb.prepare(`
        UPDATE users SET password = ?
        WHERE email = ?
    `).bind(hashedPassword, email).run();

    // delete token
    await env.cldb.prepare(`
        DELETE FROM password_resets WHERE id = ?
    `).bind(reset_token).run();

    return json({
        success: true,
        message: "Password reset successful"
    });
}

async function cleanupOTPs(env) {
    const now = Date.now();

    await env.cldb.prepare(`
        DELETE FROM otps WHERE expires_at < ?
    `).bind(now).run();

    await env.cldb.prepare(`
        DELETE FROM password_resets WHERE expires_at < ?
    `).bind(now).run();

    console.log("OTP cleanup ran at", new Date(now).toISOString());
}