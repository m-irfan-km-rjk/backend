import { requireAuth } from "../users/auth";
import json from "./json";

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

// 🚀 SEND EMAIL OTP
export async function sendOTP(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { email } = await req.json();

    if (!email) {
        return json({ error: "Email required" }, 400);
    }

    const otpKey = `otp:${email}`;
    const rateKey = `rate:${email}`;

    // ⚠️ Rate limit
    const rateExists = await env.OTP_STORE.get(rateKey);
    if (rateExists) {
        return json({
            success: false,
            message: "Too many requests. Try again in a minute."
        }, 429);
    }

    await env.OTP_STORE.put(rateKey, "1", { expirationTtl: 60 });

    // 🔢 Generate + hash OTP
    const otp = generateOTP();
    const hashedOtp = await hashOTP(otp);

    await env.OTP_STORE.put(otpKey, hashedOtp, { expirationTtl: 300 });

    // ✉️ Send email via Resend
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
        message: "OTP sent to email"
    });
}

// 🔐 VERIFY OTP
export async function verifyOTP(req, env) {
    const { email, otp } = await req.json();

    if (!email || !otp) {
        return json({ error: "Email and OTP required" }, 400);
    }

    const otpKey = `otp:${email}`;

    const storedHashedOtp = await env.OTP_STORE.get(otpKey);

    if (!storedHashedOtp) {
        return json({
            success: false,
            message: "OTP expired"
        }, 400);
    }

    const hashedInput = await hashOTP(otp);

    if (storedHashedOtp !== hashedInput) {
        return json({
            success: false,
            message: "Invalid OTP"
        }, 401);
    }

    // ✅ delete after success
    await env.OTP_STORE.delete(otpKey);

    return json({
        success: true,
        message: "OTP verified"
    });
}