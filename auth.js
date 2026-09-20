const authApiBase = window.API_BASE || "http://localhost:3001";
const openAuthBtn = document.getElementById("openAuthBtn");
const closeAuthBtn = document.getElementById("closeAuthBtn");
const authOverlay = document.getElementById("authOverlay");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessage = document.getElementById("authMessage");
const signedInActions = document.getElementById("signedInActions");
const accountName = document.getElementById("accountName");
const logoutBtn = document.getElementById("logoutBtn");
const googleSignIn = document.getElementById("googleSignIn");
const turnstileWidget = document.getElementById("turnstileWidget");
const turnstileToken = document.getElementById("turnstileToken");

let authReturnFocus = null;
let turnstileWidgetId = null;

async function authRequest(path, options = {}) {
    const response = await fetch(`${authApiBase}${path}`, {
        credentials: "include",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
}

function renderAccount(user) {
    openAuthBtn.hidden = !!user;
    signedInActions.hidden = !user;
    accountName.textContent = user?.displayName || "";
    accountName.title = user?.email || "";
    window.dispatchEvent(new CustomEvent("blackjack-auth-change", { detail: { user: user || null } }));
}

function setAuthMode(mode) {
    const isLogin = mode === "login";
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    loginTab.setAttribute("aria-selected", String(isLogin));
    registerTab.setAttribute("aria-selected", String(!isLogin));
    authMessage.textContent = "";
    const form = isLogin ? loginForm : registerForm;
    requestAnimationFrame(() => form.querySelector("input")?.focus());
}

function openAuth(mode = "login") {
    authReturnFocus = document.activeElement;
    setAuthMode(mode);
    authOverlay.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeAuth() {
    authOverlay.hidden = true;
    document.body.style.overflow = "";
    authReturnFocus?.focus?.();
}

async function submitAuthForm(form, path) {
    const submitButton = form.querySelector("button[type='submit']");
    const values = Object.fromEntries(new FormData(form));
    values.sessionId = window.BLACKJACK_SESSION_ID;
    authMessage.textContent = "";
    submitButton.disabled = true;

    try {
        const data = await authRequest(path, {
            method: "POST",
            body: JSON.stringify(values)
        });
        renderAccount(data.user);
        form.reset();
        if (form === registerForm && turnstileWidgetId !== null) {
            window.turnstile?.reset(turnstileWidgetId);
        }
        closeAuth();
    } catch (err) {
        authMessage.textContent = err.message;
        if (form === registerForm && turnstileWidgetId !== null) {
            turnstileToken.value = "";
            window.turnstile?.reset(turnstileWidgetId);
        }
    } finally {
        submitButton.disabled = false;
    }
}

function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Unable to load human verification"));
        document.head.appendChild(script);
    });
}

function loadGoogleScript() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Unable to load Google sign-in"));
        document.head.appendChild(script);
    });
}

async function handleGoogleCredential(response) {
    authMessage.textContent = "Signing in with Google…";
    try {
        const data = await authRequest("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({
                credential: response.credential,
                sessionId: window.BLACKJACK_SESSION_ID
            })
        });
        renderAccount(data.user);
        closeAuth();
    } catch (err) {
        authMessage.textContent = err.message;
    }
}

async function configureGoogleSignIn(googleClientId) {
    if (!googleClientId) return;
    try {
        await loadGoogleScript();
        googleSignIn.replaceChildren();
        window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredential
        });
        window.google.accounts.id.renderButton(googleSignIn, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: Math.min(340, googleSignIn.clientWidth || 340)
        });
    } catch (err) {
        const unavailable = document.createElement("div");
        unavailable.className = "google-unavailable";
        unavailable.textContent = err.message;
        googleSignIn.replaceChildren(unavailable);
    }
}

async function configureTurnstile(turnstileSiteKey) {
    if (!turnstileSiteKey) return;
    try {
        await loadTurnstileScript();
        turnstileWidget.hidden = false;
        turnstileWidgetId = window.turnstile.render(turnstileWidget, {
            sitekey: turnstileSiteKey,
            action: "register",
            theme: "light",
            size: "flexible",
            callback: (token) => { turnstileToken.value = token; },
            "expired-callback": () => { turnstileToken.value = ""; },
            "error-callback": () => { turnstileToken.value = ""; }
        });
    } catch (err) {
        authMessage.textContent = err.message;
    }
}

async function configureAuthProviders() {
    try {
        const config = await authRequest("/api/auth/config");
        await Promise.all([
            configureGoogleSignIn(config.googleClientId),
            configureTurnstile(config.turnstileSiteKey)
        ]);
    } catch (err) {
        const unavailable = document.createElement("div");
        unavailable.className = "google-unavailable";
        unavailable.textContent = err.message;
        googleSignIn.replaceChildren(unavailable);
    }
}

openAuthBtn.addEventListener("click", () => openAuth("login"));
closeAuthBtn.addEventListener("click", closeAuth);
loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));
loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthForm(loginForm, "/api/auth/login");
});
registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthForm(registerForm, "/api/auth/register");
});
authOverlay.addEventListener("click", (event) => {
    if (event.target === authOverlay) closeAuth();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !authOverlay.hidden) closeAuth();
});
logoutBtn.addEventListener("click", async () => {
    if (window.isBlackjackRoundActive?.()) {
        logoutBtn.textContent = "Finish round first";
        setTimeout(() => { logoutBtn.textContent = "Log out"; }, 1800);
        return;
    }
    logoutBtn.disabled = true;
    try {
        await authRequest("/api/auth/logout", { method: "POST", body: "{}" });
        renderAccount(null);
        await window.startFreshBlackjackSession?.();
        window.google?.accounts?.id?.disableAutoSelect?.();
    } catch (err) {
        openAuth("login");
        authMessage.textContent = err.message;
    } finally {
        logoutBtn.disabled = false;
    }
});

renderAccount(null);
authRequest("/api/auth/me")
    .then(({ user }) => renderAccount(user))
    .catch(() => renderAccount(null));
configureAuthProviders();
