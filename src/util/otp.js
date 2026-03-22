// 🔐 Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 🔐 Hash OTP (SHA-256)
async function hashOTP(otp) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(otp)
    );
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

// 🚀 SEND OTP
export async function sendOTP(req, env) {
    const user = await requireAuth(req, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { phone } = await req.json();

    const otpKey = `otp:${phone}`;
    const rateKey = `rate:${phone}`;

    // ⚠️ Rate limit (1 request per 60 sec)
    const rateExists = await env.OTP_STORE.get(rateKey);
    if (rateExists) {
        return new Response(JSON.stringify({
            success: false,
            message: "Too many requests. Try again in a minute."
        }), { status: 429 });
    }

    // set rate limit
    await env.OTP_STORE.put(rateKey, "1", { expirationTtl: 60 });

    // 🔢 Generate OTP
    const otp = generateOTP();
    const hashedOtp = await hashOTP(otp);

    // store hashed OTP (5 min expiry)
    await env.OTP_STORE.put(otpKey, hashedOtp, { expirationTtl: 300 });

    const message = `Your OTP is ${otp}`;

    // 📲 Send SMS
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
            "authorization": env.FAST2SMS_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            route: "q",
            message: message,
            language: "english",
            flash: 0,
            numbers: phone
        })
    });

    const data = await res.json();

    return new Response(JSON.stringify({
        success: true,
        message: "OTP sent"
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

// 🔐 VERIFY OTP
export async function verifyOTP(req, env) {
    const { phone, otp } = await req.json();

    const otpKey = `otp:${phone}`;

    const storedHashedOtp = await env.OTP_STORE.get(otpKey);

    if (!storedHashedOtp) {
        return new Response(JSON.stringify({
            success: false,
            message: "OTP expired"
        }), { status: 400 });
    }

    const hashedInput = await hashOTP(otp);

    if (storedHashedOtp !== hashedInput) {
        return new Response(JSON.stringify({
            success: false,
            message: "Invalid OTP"
        }), { status: 401 });
    }

    // ✅ delete after success
    await env.OTP_STORE.delete(otpKey);

    return new Response(JSON.stringify({
        success: true,
        message: "OTP verified"
    }));
}