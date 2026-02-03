import { useState, useRef, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const MAX_IMG_PX = 640;
const CATEGORIES = {
  recyclable:  { label:"Recyclable",  icon:"♻️",  color:"#4ade80", bg:"rgba(74,222,128,0.13)",  border:"rgba(74,222,128,0.35)"  },
  compostable: { label:"Compostable", icon:"🌱",  color:"#a3e635", bg:"rgba(163,230,53,0.13)",  border:"rgba(163,230,53,0.35)"  },
  hazardous:   { label:"Hazardous",   icon:"⚠️",  color:"#fb923c", bg:"rgba(251,146,60,0.13)",  border:"rgba(251,146,60,0.35)"  },
  landfill:    { label:"Landfill",    icon:"🗑️",  color:"#f87171", bg:"rgba(248,113,113,0.13)", border:"rgba(248,113,113,0.35)" },
  reusable:    { label:"Reusable",    icon:"🔄",  color:"#60a5fa", bg:"rgba(96,165,250,0.13)",  border:"rgba(96,165,250,0.35)"  },
};
const QUICK = ["pizza box","plastic bottle","banana peel","battery","glass jar","aluminum can","tissue paper","paint can","coffee grounds","cardboard box","plastic bag","old t-shirt"];
const TABS  = ["Classify","Stats","Learn"];

// ─── IMAGE RESIZE ───────────────────────────────────────────────────────────
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > MAX_IMG_PX || h > MAX_IMG_PX) {
        const ratio = Math.min(MAX_IMG_PX / w, MAX_IMG_PX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("toBlob failed"));
        const reader = new FileReader();
        reader.onload  = () => resolve({ base64: reader.result.split(",")[1], mime: blob.type, dataUrl: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, "image/webp", 0.85);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── API LAYER ──────────────────────────────────────────────────────────────
async function classifyText(item, isDirty) {
  const res = await fetch("/api/classify-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item, isDirty }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Text classification failed");
  return data;
}

async function classifyImage(base64, mime, isDirty) {
  const res = await fetch("/api/classify-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mime, isDirty }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Image classification failed");
  return data;
}

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
const Spinner = () => (
  <div style={{ width:20, height:20, border:"2.5px solid rgba(255,255,255,0.2)", borderTopColor:"#4ade80", borderRadius:"50%", animation:"spin 0.65s linear infinite" }} />
);

const Badge = ({ cat }) => {
  const c = CATEGORIES[cat]; if (!c) return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      background:c.bg, border:`1px solid ${c.border}`, borderRadius:20,
      padding:"5px 14px", fontSize:13, fontWeight:700, color:c.color, whiteSpace:"nowrap",
    }}>{c.icon} {c.label}</span>
  );
};

const MiniLabel = ({ children }) => (
  <span style={{ fontSize:10.5, textTransform:"uppercase", letterSpacing:1.2, color:"rgba(200,230,200,0.4)", fontFamily:"Georgia,serif" }}>{children}</span>
);

const AlertBox = ({ type="info", children }) => {
  const s = type==="warning"
    ? { bg:"rgba(251,146,60,0.12)", border:"rgba(251,146,60,0.35)", color:"#fdba74", icon:"⚠️" }
    : type==="disclaimer"
      ? { bg:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.28)", color:"#cbd5e1", icon:"📍" }
      : { bg:"rgba(96,165,250,0.12)", border:"rgba(96,165,250,0.35)", color:"#93c5fd", icon:"💡" };
  return (
    <div style={{ display:"flex", gap:8, background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:"9px 13px" }}>
      <span style={{ fontSize:15, flexShrink:0 }}>{s.icon}</span>
      <p style={{ margin:0, fontSize:12.5, color:s.color, lineHeight:1.5 }}>{children}</p>
    </div>
  );
};

const DirtyToggle = ({ on, onChange }) => (
  <div onClick={onChange} style={{
    display:"flex", alignItems:"center", gap:10,
    background: on ? "rgba(251,146,60,0.14)" : "rgba(255,255,255,0.045)",
    border:`1px solid ${on ? "rgba(251,146,60,0.38)" : "rgba(74,222,128,0.18)"}`,
    borderRadius:14, padding:"10px 14px", cursor:"pointer", transition:"all 0.22s", userSelect:"none",
  }}>
    <span style={{ fontSize:20 }}>{on ? "🍕" : "🧼"}</span>
    <div style={{ flex:1 }}>
      <p style={{ margin:0, fontSize:13, fontWeight:600, color: on ? "#fdba74" : "#c8e6c9" }}>
        {on ? "Marked as Dirty / Food-Soiled" : "Is it dirty?"}
      </p>
      <p style={{ margin:"1px 0 0", fontSize:11, color:"rgba(200,230,200,0.35)" }}>
        {on ? "AI will adjust classification for contamination" : "Toggle if the item has food or liquid on it"}
      </p>
    </div>
    <div style={{ width:42, height:24, borderRadius:12, position:"relative", background: on ? "linear-gradient(135deg,#fb923c,#f97316)" : "rgba(255,255,255,0.12)", transition:"background 0.25s" }}>
      <div style={{ position:"absolute", top:3, left: on ? 21 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,0.3)", transition:"left 0.25s" }} />
    </div>
  </div>
);

// ─── TABS ───────────────────────────────────────────────────────────────────
const StatsTab = ({ history }) => {
  const total  = history.length;
  const co2    = history.reduce((s,h) => s + (h.co2_saved_kg||0), 0);
  const counts = {};
  history.forEach(h => { counts[h.category] = (counts[h.category]||0)+1; });
  const score = Math.min(Math.round(co2 * 10), 100);
  const arc   = (score / 100) * 276.5;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {[
          { label:"CO₂ Saved",   value:co2.toFixed(2),  unit:"kg",    icon:"🌍", color:"#4ade80" },
          { label:"Items Sorted", value:String(total), unit:"items", icon:"📦", color:"#60a5fa" },
        ].map((c,i) => (
          <div key={i} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(74,222,128,0.14)", borderRadius:16, padding:"16px 10px", textAlign:"center" }}>
            <div style={{ fontSize:22 }}>{c.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:c.color, marginTop:3 }}>{c.value}</div>
            <div style={{ fontSize:10.5, color:"rgba(200,230,200,0.4)", marginTop:2 }}>{c.unit} · {c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(74,222,128,0.12)", borderRadius:16, padding:18, textAlign:"center" }}>
        <MiniLabel>Eco Score</MiniLabel>
        <div style={{ position:"relative", width:108, height:108, margin:"12px auto 0" }}>
          <svg width="108" height="108" viewBox="0 0 108 108">
            <circle cx="54" cy="54" r="43" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
            <circle cx="54" cy="54" r="43" fill="none" stroke="#4ade80" strokeWidth="11"
              strokeDasharray={`${arc} 276.5`} strokeLinecap="round"
              transform="rotate(-90 54 54)" style={{ transition:"stroke-dasharray 0.7s ease" }} />
          </svg>
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:22, fontWeight:800, color:"#4ade80" }}>{score}</span>
            <span style={{ fontSize:9.5, color:"rgba(200,230,200,0.38)", textTransform:"uppercase", letterSpacing:1 }}>/ 100</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const LEARN_DATA = [
  { title:"The Pizza Box Problem", icon:"🍕", text:"A single greasy pizza box can contaminate an entire batch of cardboard recycling. Rule: greasy bottom → compost it. The clean top can often be recycled separately." },
  { title:"What is Wishcycling?", icon:"🌀", text:"Wishcycling is tossing non-recyclables hoping they'll be recycled. It damages the whole stream and can cause batches to be rejected." },
  { title:"The Clean & Dry Rule", icon:"🚿", text:"Most recyclables must be clean and dry. Rinse a peanut butter jar for 30 seconds and it becomes perfectly recyclable." }
];

const LearnTab = () => {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
      {LEARN_DATA.map((item,i) => (
        <div key={i} style={{ background: open===i ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)", border:`1px solid ${open===i ? "rgba(74,222,128,0.3)" : "rgba(74,222,128,0.12)"}`, borderRadius:14, overflow:"hidden" }}>
          <div onClick={() => setOpen(open===i ? null : i)} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 15px", cursor:"pointer" }}>
            <span style={{ fontSize:21 }}>{item.icon}</span>
            <span style={{ flex:1, fontSize:13.5, fontWeight:600, color:"#e8f5e9" }}>{item.title}</span>
            <span style={{ fontSize:12, transform: open===i ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
          </div>
          {open===i && <div style={{ padding:"0 15px 13px 50px", fontSize:13, color:"#a7d9a2" }}>{item.text}</div>}
        </div>
      ))}
    </div>
  );
};

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function EcoSort() {
  const [tab, setTab] = useState("Classify");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [imgData, setImgData] = useState(null);
  const fileRef = useRef();

  const classify = useCallback(async (textOverride) => {
    const text = textOverride || input.trim();
    if (!imgData && !text) return;

    setLoading(true); setError(null);
    try {
      const res = imgData 
        ? await classifyImage(imgData.base64, imgData.mime, isDirty)
        : await classifyText(text, isDirty);
      
      setResult(res);
      setHistory(prev => [...prev, { ...res, id: Date.now() }]);
      setInput(""); setImgData(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [input, imgData, isDirty]);

  return (
    <div style={{ minHeight:"100vh", background:"#0a140a", color:"#e8f5e9", fontFamily:"Georgia,serif", padding:20 }}>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      <div style={{ maxWidth:500, margin:"0 auto" }}>
        <h1 style={{ textAlign:"center", color:"#4ade80" }}>EcoSort</h1>

        <div style={{ display:"flex", gap:5, marginBottom:20, background:"rgba(255,255,255,0.05)", padding:5, borderRadius:15 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:10, borderRadius:10, border:"none", background: tab===t ? "#4ade80" : "transparent", color: tab===t ? "#000" : "#fff", cursor:"pointer" }}>{t}</button>
          ))}
        </div>

        {tab === "Classify" && (
          <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
            <div style={{ background:"rgba(255,255,255,0.05)", padding:15, borderRadius:15 }}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="What are you throwing away?" style={{ width:"100%", padding:10, borderRadius:8, border:"1px solid #4ade80", background:"#000", color:"#fff", boxSizing:"border-box" }} />
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:10 }}>
                {QUICK.map(q => <button key={q} onClick={() => classify(q)} style={{ background:"rgba(74,222,128,0.1)", border:"1px solid #4ade80", color:"#4ade80", borderRadius:15, padding:"2px 10px", fontSize:11, cursor:"pointer" }}>{q}</button>)}
              </div>
            </div>

            <DirtyToggle on={isDirty} onChange={() => setIsDirty(!isDirty)} />

            <div onClick={() => fileRef.current.click()} style={{ border:"2px dashed #4ade80", padding:20, borderRadius:15, textAlign:"center", cursor:"pointer" }}>
               <input ref={fileRef} type="file" hidden onChange={e => resizeImage(e.target.files[0]).then(setImgData)} />
               {imgData ? <img src={imgData.dataUrl} style={{ width:100, borderRadius:10 }} /> : "Click to Upload Image"}
            </div>

            <button onClick={() => classify()} disabled={loading} style={{ width:"100%", padding:15, borderRadius:15, background:"#4ade80", color:"#000", fontWeight:"bold", cursor:"pointer" }}>
              {loading ? <Spinner /> : "Classify Now"}
            </button>

            {error && <AlertBox type="warning">{error}</AlertBox>}
            
            {result && (
              <div style={{ background:"rgba(255,255,255,0.1)", padding:20, borderRadius:15 }}>
                <Badge cat={result.category} />
                <h3 style={{ margin:"10px 0" }}>{result.item_detected}</h3>
                <p>{result.reason}</p>
                <AlertBox>{result.eco_fact}</AlertBox>
              </div>
            )}
          </div>
        )}

        {tab === "Stats" && <StatsTab history={history} />}
        {tab === "Learn" && <LearnTab />}
      </div>
    </div>
  );
}