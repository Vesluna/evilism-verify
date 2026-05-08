/* ═══════════════════════════════════════════════════════════════
   EVILISM — Gates of Umbra Verification Site
   app.js

   !! CONFIGURE THESE BEFORE DEPLOYING !!
   Replace the placeholder values below with your real values.
═══════════════════════════════════════════════════════════════ */

const CONFIG = {
  // Your Discord application's Client ID (from Discord Developer Portal)
  DISCORD_CLIENT_ID: "YOUR_DISCORD_CLIENT_ID",

  // The full URL of your bot's OAuth2 callback endpoint
  // e.g. "https://your-bot-host.com/auth/callback"
  OAUTH_REDIRECT_URI: "https://your-bot-host.com/auth/callback",

  // The full URL of your bot's form submission endpoint
  // e.g. "https://your-bot-host.com/api/submit"
  SUBMIT_ENDPOINT: "https://your-bot-host.com/api/submit",

  // The full URL of your bot's BuildersClub status endpoint
  // e.g. "https://your-bot-host.com/api/builders-status"
  BUILDERS_STATUS_ENDPOINT: "https://your-bot-host.com/api/builders-status",
};

/* ─────────────────────────────────────────────────────────────
   SCREEN MANAGEMENT
───────────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showError(title, message) {
  document.getElementById("error-title").textContent = title;
  document.getElementById("error-message").textContent = message;
  showScreen("error-screen");
}

/* ─────────────────────────────────────────────────────────────
   DISCORD OAUTH2 FLOW
   The landing page sends the user to Discord for login.
   Discord redirects back to the BOT BACKEND (/auth/callback),
   which then redirects here with ?token=<session_token>.
   We read that token from the URL and use it for all API calls.
───────────────────────────────────────────────────────────── */
function startOAuth() {
  const state = generateState();
  sessionStorage.setItem("oauth_state", state);

  const params = new URLSearchParams({
    client_id:     CONFIG.DISCORD_CLIENT_ID,
    redirect_uri:  CONFIG.OAUTH_REDIRECT_URI,
    response_type: "code",
    scope:         "identify",
    state:         state,
  });

  window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
}

function generateState() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

/* ─────────────────────────────────────────────────────────────
   ON PAGE LOAD — check for ?token= in URL (post-OAuth redirect)
───────────────────────────────────────────────────────────── */
window.addEventListener("DOMContentLoaded", async () => {
  initParticles();

  const params  = new URLSearchParams(window.location.search);
  const token   = params.get("token");
  const already = params.get("already_submitted");
  const expired = params.get("expired");

  if (already === "1") {
    showError(
      "Application Already Submitted",
      "Our records show you have already submitted an application. " +
      "You cannot resubmit this form. Watch your Discord DMs for a decision from the EVILISM bot. " +
      "If your form has expired, you will be notified and may begin a new application."
    );
    return;
  }

  if (expired === "1") {
    showError(
      "Session Expired",
      "Your verification session has expired. Please return to the Discord server and request a new verification link."
    );
    return;
  }

  if (token) {
    // Store token for API calls
    sessionStorage.setItem("evilism_token", token);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    // Load the form
    await loadFormScreen(token);
  } else {
    showScreen("landing");
  }

  // Conditional reveal for q3 reservations
  document.getElementById("q3")?.addEventListener("change", function () {
    const field = document.getElementById("q3-reservations-field");
    if (this.value === "yes_reservations") {
      field.style.display = "block";
      document.getElementById("q3b").required = true;
    } else {
      field.style.display = "none";
      document.getElementById("q3b").required = false;
    }
  });

  // Form submission
  document.getElementById("verification-form")?.addEventListener("submit", handleSubmit);
});

/* ─────────────────────────────────────────────────────────────
   LOAD FORM SCREEN
   Fetches user identity and BuildersClub status from the backend.
───────────────────────────────────────────────────────────── */
async function loadFormScreen(token) {
  try {
    // Fetch user info + builders status in parallel
    const [userRes, buildersRes] = await Promise.all([
      fetch(`${CONFIG.SUBMIT_ENDPOINT.replace("/api/submit", "")}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(CONFIG.BUILDERS_STATUS_ENDPOINT),
    ]);

    if (!userRes.ok) {
      showError("Authentication Failed", "We could not verify your Discord identity. Please return to the server and try again.");
      return;
    }

    const user     = await userRes.json();
    const builders = buildersRes.ok ? await buildersRes.json() : { enabled: false };

    // Populate user badge
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || "0") % 5}.png`;

    document.getElementById("user-avatar").src  = avatarUrl;
    document.getElementById("user-name").textContent =
      user.global_name || user.username || "Unknown User";

    document.getElementById("user-badge").classList.remove("hidden");

    // BuildersClub banner
    if (builders.enabled) {
      document.getElementById("builders-banner").classList.remove("hidden");
    }

    showScreen("form-screen");

  } catch (err) {
    console.error(err);
    showError("Connection Error", "Could not reach the EVILISM server. Please try again later.");
  }
}

/* ─────────────────────────────────────────────────────────────
   FORM SUBMISSION
───────────────────────────────────────────────────────────── */
async function handleSubmit(e) {
  e.preventDefault();

  const form = e.target;
  if (!validateForm(form)) return;

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> Sealing your oath...`;

  const token = sessionStorage.getItem("evilism_token");

  const answers = {
    q1:  form.q1.value.trim(),
    q2:  form.q2.value.trim(),
    q3:  form.q3.value,
    q3b: form.q3b ? form.q3b.value.trim() : "",
    q4:  form.q4.value.trim(),
    q5:  form.q5.value.trim(),
    q6:  form.q6.value.trim(),
    q7:  form.q7.value,
    q8:  form.q8.value,
    q9:  form.q9.value.trim(),
    q10: form.q10.value.trim(),
    q11: form.q11.value.trim(),
    q12: form.q12.value.trim(),
    q13: form.q13 ? form.q13.value.trim() : "",
  };

  try {
    const res = await fetch(CONFIG.SUBMIT_ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify({ answers }),
    });

    const data = await res.json();

    if (res.status === 409) {
      showError(
        "Application Already Submitted",
        "You have already submitted an application. You cannot resubmit. Watch your Discord DMs for a decision."
      );
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || "Unknown server error");
    }

    sessionStorage.removeItem("evilism_token");
    showScreen("success-screen");

  } catch (err) {
    console.error(err);
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Application to The Dark Council";
    alert("Something went wrong while submitting your application. Please try again.");
  }
}

/* ─────────────────────────────────────────────────────────────
   FORM VALIDATION
───────────────────────────────────────────────────────────── */
function validateForm(form) {
  let valid = true;

  // Clear previous invalid states
  form.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));

  const requiredFields = form.querySelectorAll("[required]");
  requiredFields.forEach(field => {
    const val = field.value.trim();
    if (!val || (field.tagName === "SELECT" && val === "")) {
      field.classList.add("invalid");
      valid = false;
    } else if (field.minLength && val.length < field.minLength) {
      field.classList.add("invalid");
      valid = false;
    }
  });

  if (!valid) {
    const firstInvalid = form.querySelector(".invalid");
    firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return valid;
}

/* ─────────────────────────────────────────────────────────────
   PARTICLE BACKGROUND
───────────────────────────────────────────────────────────── */
function initParticles() {
  const canvas = document.getElementById("particles");
  const ctx    = canvas.getContext("2d");
  let particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener("resize", resize);

  class Particle {
    constructor() { this.reset(true); }

    reset(initial = false) {
      this.x    = Math.random() * canvas.width;
      this.y    = initial ? Math.random() * canvas.height : canvas.height + 10;
      this.size = Math.random() * 1.5 + 0.3;
      this.speed = Math.random() * 0.4 + 0.1;
      this.opacity = Math.random() * 0.5 + 0.1;
      this.drift   = (Math.random() - 0.5) * 0.3;
      // Colour: purple or gold
      this.color = Math.random() > 0.7
        ? `rgba(212,160,23,${this.opacity})`
        : `rgba(192,132,252,${this.opacity})`;
    }

    update() {
      this.y -= this.speed;
      this.x += this.drift;
      if (this.y < -10) this.reset();
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
  }

  animate();
}
