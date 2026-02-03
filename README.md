# 🌍 EcoSort — AI-Powered Waste Classifier

An AI agent that helps users sort waste correctly: recyclable, compostable, hazardous, landfill, or reusable. Powered by Claude, built with a locked-down security layer so it's ready to ship.

---

## 📂 Project Structure

```
ecosort/
├── server/
│   └── server.js          ← Express API proxy (the ONLY file that sees the API key)
├── src/
│   └── EcoSort.jsx        ← React frontend (zero secrets)
├── Dockerfile             ← Two-stage production image
├── docker-compose.yml     ← Orchestration + runtime env injection
├── .env.example           ← Template; copy → .env and fill in values
├── .gitignore             ← .env is excluded
├── package.json
└── README.md
```

---

## 🔒 Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (EcoSort.jsx)                                  │
│                                                         │
│   fetch("/api/classify-text")   ← relative URL          │
│   fetch("/api/classify-image")     no key, no secrets   │
└────────────────────┬────────────────────────────────────┘
                     │  HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Express Server  (server.js)                            │
│                                                         │
│   ① Helmet        → secure HTTP headers                 │
│   ② CORS          → only whitelisted origins            │
│   ③ Rate-limiter  → 30 req/min per IP, 200 globally    │
│   ④ Validator     → length caps, type & mime checks     │
│   ⑤ Error handler → stack traces never reach client    │
│                                                         │
│   ANTHROPIC_API_KEY  ← read from .env / OS env only    │
└────────────────────┬────────────────────────────────────┘
                     │  HTTPS (Anthropic SDK)
                     ▼
          ╔═══════════════════════╗
          ║   Anthropic API       ║
          ║   claude-sonnet-4     ║
          ╚═══════════════════════╝
```

### What each layer does

| Layer | What it blocks |
|---|---|
| **Helmet** | Clickjacking, MIME sniffing, protocol downgrade |
| **CORS whitelist** | Cross-origin requests from unknown domains |
| **Rate-limiter** | Brute-force / spam / cost-blowout attacks |
| **Input validator** | Oversized payloads, bad types, prompt-injection via huge strings |
| **Error boundary** | Internal stack traces, file paths, SDK internals |
| **Docker hardening** | Read-only FS, dropped capabilities, non-root user |

---

## 🚀 Quick Start (local development)

```bash
# 1. Clone & install
git clone <repo-url>
cd ecosort
npm install

# 2. Create .env from template
cp .env.example .env
# Open .env and paste your real Anthropic key

# 3. Start the server
npm run dev
# → http://localhost:3000

# 4. Serve the React frontend
# Point your Vite / CRA / Next dev server at the same origin,
# or use a reverse proxy so /api/* hits the Express server.
```

---

## 🐳 Production Deploy (Docker)

```bash
# 1. Make sure .env is filled in (never committed to git)
cp .env.example .env   # edit with real values

# 2. Build & run
docker compose up --build -d

# 3. Verify
curl http://localhost:3000/api/health
# → { "status": "ok" }
```

### Environment variables (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Your Anthropic API key |
| `PORT` | ❌ | `3000` | Port the server listens on |
| `ALLOWED_ORIGINS` | ✅ | — | Comma-separated list of frontend origins |

---

## ✅ Production Checklist

- [ ] Replace `ALLOWED_ORIGINS` with your real domain (`https://ecosort.yourdomain.com`)
- [ ] Put the server behind a reverse proxy (Nginx / Caddy) that terminates TLS
- [ ] Set `NODE_ENV=production` in your `.env` or host environment
- [ ] Enable log aggregation (e.g. Datadog, CloudWatch) — `console.error` calls are already in place
- [ ] Set up alerting on 5xx error rate
- [ ] Rotate your API key periodically via the Anthropic console
- [ ] Consider adding a Redis-backed rate-limiter if you expect high traffic

---

## 🌿 Features

- **Text classification** — type any waste item
- **Image classification** — upload a photo (auto-resized to ≤640 px)
- **"Is it dirty?" toggle** — shifts classification based on contamination
- **Eco Facts** — educational snippet per item
- **Wishcycling alerts** — gentle warnings when recycling won't work
- **Local disclaimer** — reminds users that rules vary by municipality
- **CO₂ tracker & Eco Score** — gamified sustainability stats
- **Learn tab** — accordion lessons on common waste myths
