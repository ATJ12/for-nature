"use strict";

const express       = require("express");
const helmet        = require("helmet");
const cors          = require("cors");
const { rateLimit } = require("express-rate-limit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// ─── GUARD: GEMINI API KEY ──────────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  console.error("[EcoSort] FATAL — GEMINI_API_KEY is not set.");
  process.exit(1);
}

const PORT            = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
const MODEL_NAME      = "gemini-flash-latest"; 

// ─── GEMINI CLIENT ──────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: MODEL_NAME,
  generationConfig: { responseMimeType: "application/json" } 
});

const app = express();

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────

// 1. Helmet: Security headers with custom CSP to allow your inline React code
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "connect-src": ["'self'"], 
        "script-src": ["'self'", "'unsafe-inline'"],
        "script-src-attr": ["'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
      },
    },
  })
);

// 2. CORS: Origin control
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, ALLOWED_ORIGINS.includes(origin));
  },
  methods: ["POST"],
  allowedHeaders: ["Content-Type"],
}));

// 3. Rate Limiter: ~12 requests per minute to stay under Gemini Free Tier limits
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12, 
  message: { error: "Rate limit reached. Please wait a minute." },
});
app.use("/api", limiter);

// 4. Body Parser: Limit payload size for base64 images
app.use(express.json({ limit: "5mb" }));

// 5. STATIC FILE SERVING: This fixes the "Cannot GET /" error
// This serves your index.html and React build files from the current folder
app.use(express.static(".", { extensions: ["html"] }));

// ─── PROMPT BUILDER ──────────────────────────────────────────────────────────
function buildSystemPrompt(isDirty) {
  return `You are an expert waste classification AI. 
  RULES:
  - Categories: recyclable, compostable, hazardous, landfill, reusable.
  - Item state: ${isDirty ? "DIRTY/FOOD-SOILED" : "CLEAN"}.
  - If DIRTY paper/cardboard -> prefer compostable or landfill.
  - If DIRTY plastic -> landfill.
  - Hazardous (batteries, tech, chemicals) always stay hazardous.
  - Provide a short eco_fact and a wishcycling_alert if applicable.
  
  Return valid JSON only:
  {
    "category": "string",
    "reason": "string",
    "eco_fact": "string",
    "contamination_warning": "string",
    "wishcycling_alert": "string",
    "disclaimer": "string",
    "co2_saved_kg": number,
    "item_detected": "string"
  }`;
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/** POST /api/classify-text */
app.post("/api/classify-text", async (req, res) => {
  const { item, isDirty } = req.body;
  if (!item || typeof isDirty !== "boolean") return res.status(400).json({ error: "Invalid input" });

  try {
    const prompt = `${buildSystemPrompt(isDirty)}\n\nClassify this item: ${item}`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const response = JSON.parse(responseText);
    
    response.item_detected = response.item_detected || item;
    res.json(response);
  } catch (err) {
    console.error("[Text API Error]", err);
    res.status(500).json({ error: "Gemini classification failed." });
  }
});

/** POST /api/classify-image */
app.post("/api/classify-image", async (req, res) => {
  const { base64, mime, isDirty } = req.body;
  if (!base64 || !mime) return res.status(400).json({ error: "Missing image data" });

  try {
    const prompt = buildSystemPrompt(isDirty) + "\nIdentify and classify the item in this image.";
    
    const imagePart = {
      inlineData: { data: base64, mimeType: mime }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    const response = JSON.parse(responseText);
    
    res.json(response);
  } catch (err) {
    console.error("[Image API Error]", err);
    res.status(500).json({ error: "Gemini Vision failed." });
  }
});

// ─── START SERVER ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`[EcoSort] Server running at http://localhost:${PORT}`);
  console.log(`[EcoSort] Gemini Free Tier active (${MODEL_NAME})`);
});
