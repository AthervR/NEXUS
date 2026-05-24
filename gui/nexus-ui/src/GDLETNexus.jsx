import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CesiumGlobe } from "./CesiumGlobe.jsx";

// ─── GDLET NEXUS — AI Command Center ────────────────────────────────────────
// v0.5.0 — Pre-Session 05 patch
// Changes from v0.4.0:
//   • World map: hand-drawn SVG paths → D3 geoNaturalEarth1 + world-atlas TopoJSON
//   • Flights: hardcoded array → live OpenSky Network via FastAPI /api/flights
//   • Markets: hardcoded array → live Yahoo Finance via FastAPI /api/markets
//   • News: hardcoded array → live GDELT 2.0 via FastAPI /api/news
//   • Copilot: WebSocket first, REST fallback (Session 04 pattern preserved)
//   • Voice toggle + status badge (Session 04 preserved)

// ─── THEME ──────────────────────────────────────────────────────────────────
const T = {
  bg0: "#0e0010",
  bg1: "#120018",
  bg2: "#1a0025",
  bg3: "#220030",
  bg4: "#2a0038",
  accent: "#7c3aed",
  accentBright: "#8b5cf6",
  accentSoft: "#a78bfa",
  accentDim: "#5b21b6",
  accentGlow: "rgba(139,92,246,0.15)",
  accentGlow2: "rgba(139,92,246,0.08)",
  text: "#f0e6ff",
  textDim: "#b8a0d0",
  textMuted: "#6b5080",
  green: "#34d399",
  red: "#f87171",
  amber: "#fbbf24",
  cyan: "#22d3ee",
  border: "rgba(139,92,246,0.12)",
  borderActive: "rgba(139,92,246,0.35)",
};

// ─── STATIC DATA — manually curated, not from API ───────────────────────────
const HOTSPOTS = [
  { id: "h1", name: "Taiwan Strait",          lat: 24.5, lng: 119,  risk: 92, type: "military"       },
  { id: "h2", name: "Red Sea / Bab el-Mandeb", lat: 13.5, lng: 43,   risk: 88, type: "conflict"       },
  { id: "h3", name: "South China Sea",         lat: 11,   lng: 115,  risk: 75, type: "territorial"    },
  { id: "h4", name: "Strait of Hormuz",        lat: 26.5, lng: 56.5, risk: 65, type: "chokepoint"     },
  { id: "h5", name: "Suez Canal",              lat: 30.5, lng: 32.3, risk: 58, type: "infrastructure" },
  { id: "h6", name: "Niger Delta",             lat: 5.5,  lng: 6.5,  risk: 52, type: "disruption"     },
  { id: "h7", name: "Eastern Ukraine",         lat: 48.5, lng: 37.5, risk: 85, type: "conflict"       },
];

const AGENDA = [
  { time: "09:00", title: "Stand-up: NEXUS sprint review",         tag: "work"     },
  { time: "11:30", title: "Hardware delivery — OCuLink cable",      tag: "nexus"    },
  { time: "14:00", title: "Lab session: XArm 1S calibration",       tag: "lab"      },
  { time: "16:00", title: "Review Vulkan kernel patches for Qwen3", tag: "research" },
  { time: "19:00", title: "Flight: SFO → FRA (check disruption)",   tag: "travel"   },
];

// ─── (D3 map replaced by CesiumGlobe 3D globe — see CesiumGlobe.jsx) ─────────

// ─── LIVE DATA HOOK ──────────────────────────────────────────────────────────
const API = "http://localhost:8000";

function useLiveData() {
  const [flights,    setFlights]    = useState([]);
  const [markets,    setMarkets]    = useState([]);
  const [news,       setNews]       = useState([]);
  const [dataStatus, setDataStatus] = useState({ flights: "loading", markets: "loading", news: "loading" });

  const fetchFlights = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/flights`);
      const d = await r.json();
      if (d.flights) {
        setFlights(d.flights);
        setDataStatus(s => ({ ...s, flights: "ok" }));
      }
    } catch { setDataStatus(s => ({ ...s, flights: "error" })); }
  }, []);

  const fetchMarkets = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/markets`);
      const d = await r.json();
      if (d.markets?.length) {
        setMarkets(d.markets);
        setDataStatus(s => ({ ...s, markets: "ok" }));
      }
    } catch { setDataStatus(s => ({ ...s, markets: "error" })); }
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/news?limit=25`);
      const d = await r.json();
      if (d.articles?.length) {
        setNews(d.articles);
        setDataStatus(s => ({ ...s, news: "ok" }));
      } else {
        // GDELT error or empty response — surface an error state so UI doesn't
        // stay stuck on "loading" forever; retain any articles already displayed
        setDataStatus(s => ({ ...s, news: s.news === "ok" ? "ok" : "error" }));
      }
    } catch { setDataStatus(s => ({ ...s, news: s.news === "ok" ? "ok" : "error" })); }
  }, []);

  useEffect(() => {
    fetchFlights(); fetchMarkets(); fetchNews();
    const ti = setInterval(fetchFlights,  60_000);  // 60s — OpenSky anon quota is ~400 credits/day
    const tm = setInterval(fetchMarkets,  30_000);
    const tn = setInterval(fetchNews,     30_000);  // 30s — retry fast on GDELT errors
    return () => { clearInterval(ti); clearInterval(tm); clearInterval(tn); };
  }, [fetchFlights, fetchMarkets, fetchNews]);

  return { flights, markets, news, dataStatus };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function toneToLabel(tone) {
  const t = parseFloat(tone) || 0;
  if (t < -6) return { label: "BREAKING",   color: T.red        };
  if (t < -3) return { label: "ESCALATING", color: T.amber      };
  if (t < -1) return { label: "WATCH",      color: T.accentSoft };
  if (t >  3) return { label: "POSITIVE",   color: T.green      };
  return        { label: "SIGNAL",    color: T.textMuted  };
}

function gdeltAge(seendate) {
  if (!seendate) return "";
  try {
    const iso = seendate.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z"
    );
    const mins = (Date.now() - new Date(iso).getTime()) / 60000;
    if (mins < 1)    return "just now";
    if (mins < 60)   return `${Math.floor(mins)}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  } catch { return ""; }
}

function makeSparkData(sym, len = 12) {
  let h = sym.split("").reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0x12345678);
  const rand = () => { h ^= h << 13; h ^= h >> 17; h ^= h << 5; return ((h >>> 0) / 0xffffffff) * 100; };
  return Array.from({ length: len }, rand);
}

function riskColor(risk) {
  return risk > 80 ? T.red : risk > 60 ? T.amber : T.accentSoft;
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

const Panel = ({ title, children, style, icon, badge }) => (
  <div style={{
    background: `linear-gradient(135deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    ...style,
  }}>
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 12px",
      background: T.accentGlow2,
      borderBottom: `1px solid ${T.border}`,
      userSelect: "none",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <span style={{ fontSize: 13, opacity: 0.7 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: T.accentSoft }}>{title}</span>
      </div>
      {badge && (
        <span style={{ fontSize: 9, background: T.accent, color: "#fff", padding: "1px 6px", borderRadius: 3, fontWeight: 700, letterSpacing: 1 }}>
          {badge}
        </span>
      )}
    </div>
    <div style={{ flex: 1, overflow: "auto", padding: "8px 10px", minHeight: 0 }}>
      {children}
    </div>
  </div>
);

const Sparkline = ({ data, color, w = 60, h = 16 }) => {
  if (!data?.length) return null;
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 1;
  const pts   = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`
  ).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
};

// HotspotDrawer lives inside CesiumGlobe.jsx (rendered as globe overlay)

// ─── (MapView replaced by CesiumGlobe — see CesiumGlobe.jsx) ─────────────────

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function GDLETNexus() {

  // Core state
  const [activeView,       setActiveView]       = useState("command");
  const [selectedHotspot,  setSelectedHotspot]  = useState(null);
  const [mapLayer,         setMapLayer]          = useState("hotspots");
  const [clock,            setClock]             = useState(new Date());
  const [showResearchMsg,  setShowResearchMsg]   = useState(false);

  // Copilot state
  const [copilotOpen,      setCopilotOpen]      = useState(false);
  const [copilotInput,     setCopilotInput]     = useState("");
  const [copilotLoading,   setCopilotLoading]   = useState(false);
  const [copilotMessages,  setCopilotMessages]  = useState([
    { role: "nexus", text: "NEXUS online. Cesium 3D globe active. Live data streams: OpenSky + ADS-B Exchange, Yahoo Finance, GDELT 2.0. All modules nominal. Ready for tasking." },
  ]);

  // News filter state — sidebar and center view independent
  const [newsFilter,       setNewsFilter]       = useState("ALL");
  const [centerNewsFilter, setCenterNewsFilter] = useState("ALL");

  // API + voice state (Session 04)
  const [apiStatus,        setApiStatus]        = useState("CHECKING");
  const [loadedModel,      setLoadedModel]      = useState("—");
  const [wsStatus,         setWsStatus]         = useState("DISCONNECTED");
  const [voiceActive,      setVoiceActive]      = useState(false);
  const [voiceStatus,      setVoiceStatus]      = useState("IDLE");

  // Refs
  const copilotRef        = useRef(null);
  const copilotLoadingRef = useRef(false);
  const wsRef             = useRef(null);

  // Live data from FastAPI
  const { flights, markets, news, dataStatus } = useLiveData();

  // Stable sparkline data per market symbol
  const sparkData = useMemo(() => {
    const out = {};
    markets.forEach(m => { out[m.sym] = makeSparkData(m.sym); });
    return out;
  }, [markets.map(m => m.sym).join(",")]);  // eslint-disable-line

  // Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
    link.rel  = "stylesheet";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Navigation cleanup
  useEffect(() => {
    if (activeView !== "research") setShowResearchMsg(false);
    if (activeView !== "command")  setSelectedHotspot(null);
  }, [activeView]);

  // Copilot auto-scroll
  useEffect(() => {
    if (copilotRef.current)
      copilotRef.current.scrollTop = copilotRef.current.scrollHeight;
  }, [copilotMessages, copilotLoading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
        e.preventDefault();
        setCopilotOpen(prev => !prev);
      }
      if (e.key === "Escape") {
        if (copilotOpen) setCopilotOpen(false);
        else setSelectedHotspot(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [copilotOpen]);

  // WebSocket to FastAPI bridge (Session 04)
  useEffect(() => {
    let reconnectTimer = null;

    function connect() {
      const ws = new WebSocket("ws://localhost:8000/ws");
      wsRef.current = ws;

      ws.onopen = () => setWsStatus("CONNECTED");

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "nexus_response") {
            const prefix   = msg.source === "voice" ? "🎙 " : "";
            const verified = msg.verified ? "✓ VERIFIED  " : "";
            setCopilotMessages(prev => [...prev, {
              role: "nexus",
              text: `${verified}${prefix}${msg.text}`,
            }]);
            copilotLoadingRef.current = false;
            setCopilotLoading(false);
          } else if (msg.type === "voice_status") {
            setVoiceStatus(msg.status);
          } else if (msg.type === "voice_transcript") {
            setCopilotMessages(prev => [...prev, { role: "user", text: `🎙 ${msg.text}` }]);
          }
        } catch { /* malformed frame */ }
      };

      ws.onclose = () => {
        setWsStatus("DISCONNECTED");
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
        setWsStatus("ERROR");
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // API status poll
  useEffect(() => {
    const poll = () => {
      fetch(`${API}/status`)
        .then(r => r.json())
        .then(d => {
          setApiStatus(d.lm_studio === "online" ? "ONLINE" : "DEGRADED");
          setLoadedModel(d.model_loaded ?? "—");
        })
        .catch(() => { setApiStatus("OFFLINE"); setLoadedModel("—"); });
    };
    poll();
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, []);

  // Send copilot message — WebSocket first, REST fallback
  const sendCopilot = useCallback(async () => {
    if (!copilotInput.trim() || copilotLoadingRef.current) return;
    const userMsg = copilotInput.trim();

    const history = copilotMessages
      .filter(m => m.role === "user" || m.role === "nexus")
      .slice(-10)
      .map(m => ({ role: m.role === "nexus" ? "assistant" : "user", content: m.text }));

    setCopilotMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setCopilotInput("");
    copilotLoadingRef.current = true;
    setCopilotLoading(true);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text_chat", text: userMsg }));
      return;
    }

    try {
      const r = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMsg, history }),
      });
      const d = await r.json();
      setCopilotMessages(prev => [...prev, { role: "nexus", text: d.response ?? "[No response]" }]);
    } catch {
      setCopilotMessages(prev => [...prev, {
        role: "nexus",
        text: "[ERROR] Cannot reach NEXUS API at localhost:8000. Verify FastAPI bridge is running.",
      }]);
    } finally {
      copilotLoadingRef.current = false;
      setCopilotLoading(false);
    }
  }, [copilotInput, copilotMessages]);

  // Voice toggle
  const toggleVoice = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const next = !voiceActive;
    setVoiceActive(next);
    wsRef.current.send(JSON.stringify({ type: "voice_toggle", active: next }));
    if (!next) setVoiceStatus("IDLE");
  }, [voiceActive]);

  // Derived display values
  const utc     = clock.toISOString().slice(11, 19);
  const dateStr = clock.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const apiColor = apiStatus === "ONLINE" ? T.green : apiStatus === "OFFLINE" ? T.red : T.amber;
  const wsColor  = wsStatus  === "CONNECTED" ? T.green : wsStatus === "ERROR" ? T.red : T.amber;
  const riskIndex = 73;

  const NEWS_LABELS = ["ALL", "BREAKING", "ESCALATING", "WATCH", "POSITIVE", "SIGNAL"];

  function filterNews(articles, filter) {
    if (filter === "ALL") return articles;
    return articles.filter(a => toneToLabel(a.tone).label === filter);
  }

  const filteredNews       = filterNews(news, newsFilter);
  const centerFilteredNews = filterNews(news, centerNewsFilter);

  const navItems = [
    { id: "command",  icon: "◈", label: "CMD"  },
    { id: "news",     icon: "◉", label: "FEED" },
    { id: "markets",  icon: "◎", label: "MKT"  },
    { id: "flights",  icon: "△", label: "AIR"  },
    { id: "research", icon: "◇", label: "LAB"  },
    { id: "daily",    icon: "◷", label: "DAY"  },
  ];

  // ─── VIEW RENDERING ──────────────────────────────────────────────────────────
  const renderCenter = () => {
    switch (activeView) {

      case "command":
        return null; // globe + layer strip rendered directly in centre layout below

      case "news":
        return (
          <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 0 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>LIVE INTELLIGENCE FEED</div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginTop: 2 }}>
                {dataStatus.news === "ok"
                  ? `${news.length} SIGNALS • GDELT 2.0 • MULTI-LANGUAGE • REFRESH: 2MIN`
                  : "FETCHING FROM GDELT 2.0…"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {NEWS_LABELS.map(f => (
                <button key={f} type="button" onClick={() => setCenterNewsFilter(f)} style={{
                  padding: "4px 12px",
                  border: `1px solid ${centerNewsFilter === f ? T.accent : T.border}`,
                  borderRadius: 3, fontSize: 9, letterSpacing: 1, fontWeight: 600, cursor: "pointer",
                  background: centerNewsFilter === f ? T.accentGlow : "transparent",
                  color: centerNewsFilter === f ? T.accentBright : T.textMuted,
                  fontFamily: "inherit",
                }}>{f}</button>
              ))}
            </div>

            {centerFilteredNews.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted, fontSize: 11 }}>
                {dataStatus.news === "loading" ? "Fetching live signals…" :
                 dataStatus.news === "error"   ? "GDELT unavailable — retrying in 30s…" :
                 "No articles match this filter."}
              </div>
            )}

            <div style={{ display: "grid", gap: 8 }}>
              {centerFilteredNews.map((n, i) => {
                const { label, color } = toneToLabel(n.tone);
                const age = gdeltAge(n.seendate);
                return (
                  <div key={i}
                    style={{
                      padding: "12px 14px", borderRadius: 6,
                      background: T.accentGlow2, border: `1px solid ${T.border}`,
                      cursor: "pointer", transition: "border-color 0.15s",
                    }}
                    onClick={() => n.url && window.open(n.url, "_blank")}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.borderActive}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 8, fontWeight: 800, letterSpacing: 1,
                          color, background: `${color}18`, padding: "2px 8px", borderRadius: 3,
                        }}>{label}</span>
                        <span style={{ fontSize: 9, color: T.textMuted }}>{n.sourcecountry || n.domain}</span>
                      </div>
                      <span style={{ fontSize: 9, color: T.textMuted }}>{age}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, fontWeight: 500 }}>{n.title}</div>
                    <div style={{ fontSize: 8, color: T.textMuted, marginTop: 4 }}>{n.domain}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case "markets":
        return (
          <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 0 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>MARKETS INTELLIGENCE</div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginTop: 2 }}>
                {dataStatus.markets === "ok"
                  ? `${markets.length} INSTRUMENTS • YAHOO FINANCE • REFRESH: 30S`
                  : "FETCHING LIVE PRICES…"}
              </div>
            </div>

            {markets.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted, fontSize: 11 }}>
                {dataStatus.markets === "loading" ? "Fetching live prices…" : "No market data available."}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 16 }}>
              {markets.map(m => (
                <div key={m.sym}
                  style={{
                    padding: "12px 14px", background: T.accentGlow2, borderRadius: 6,
                    border: `1px solid ${T.border}`, transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.borderActive}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.accentSoft, letterSpacing: 1 }}>{m.sym}</span>
                      <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 8 }}>{m.name}</span>
                    </div>
                    <Sparkline data={sparkData[m.sym] || makeSparkData(m.sym)} color={m.up ? T.green : T.red} w={50} h={16} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>{m.val}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: m.up ? T.green : T.red, marginTop: 2 }}>{m.chg}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: "12px 14px", background: "rgba(248,113,113,0.06)", border: `1px solid rgba(248,113,113,0.15)`, borderRadius: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.amber, marginBottom: 4 }}>AI CROSS-DOMAIN INSIGHT</div>
              <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.6 }}>
                Live market data loaded from Yahoo Finance. Cross-domain analysis available via NEXUS Copilot — ask about correlations between commodity prices, geopolitical hotspots, and equity exposure.
              </div>
            </div>
          </div>
        );

      case "flights":
        return null; // globe rendered directly in centre layout; table below

      case "research":
        return (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg0, minHeight: 0 }}>
            <div style={{ textAlign: "center", maxWidth: 440 }}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>◇</div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: T.accentSoft, marginBottom: 8 }}>LAB WORKSPACE</div>
              <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1.6, letterSpacing: 0.5, marginBottom: 20 }}>
                Research workspace, dossier builder, and knowledge synthesis engine.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {["MORNING BRIEF", "THREAT BRIEF", "COUNTRY DOSSIER", "TRIP BRIEF"].map(t => (
                  <button key={t} type="button"
                    onClick={() => setShowResearchMsg(true)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.borderActive}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                    style={{
                      padding: "6px 14px", border: `1px solid ${T.border}`, borderRadius: 4,
                      fontSize: 8, letterSpacing: 1, fontWeight: 600, color: T.textMuted,
                      background: "transparent", cursor: "pointer", transition: "border-color 0.15s",
                      fontFamily: "inherit",
                    }}>{t}</button>
                ))}
              </div>
              {showResearchMsg && (
                <div style={{
                  marginTop: 16, padding: "8px 14px", display: "inline-block",
                  background: T.accentGlow2, border: `1px solid ${T.borderActive}`,
                  borderRadius: 4, fontSize: 9, color: T.accentSoft, letterSpacing: 1,
                }}>
                  Coming in Session 05 — research workspace in development
                </div>
              )}
              <div style={{ marginTop: 24, fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>COMING IN SESSION 05</div>
            </div>
          </div>
        );

      case "daily":
        return (
          <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: T.accentSoft, marginBottom: 16 }}>DAILY OPERATIONS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

              <Panel title="SCHEDULE" icon="◷" badge={`${AGENDA.length}`} style={{ gridColumn: "1 / -1" }}>
                {AGENDA.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.accentSoft, minWidth: 48 }}>{a.time}</span>
                    <span style={{ fontSize: 11, color: T.text, flex: 1 }}>{a.title}</span>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "2px 8px", borderRadius: 3,
                      background: a.tag === "travel" ? "rgba(248,113,113,0.15)" : T.accentGlow2,
                      color: a.tag === "travel" ? T.amber : T.textMuted,
                      fontWeight: 600, textTransform: "uppercase",
                    }}>{a.tag}</span>
                  </div>
                ))}
              </Panel>

              <Panel title="WEATHER" icon="◈" badge="LOCAL">
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{ fontSize: 28, fontWeight: 300, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>72°F</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>Livermore, CA — Clear</div>
                  <div style={{ fontSize: 9, color: T.textMuted, marginTop: 8, lineHeight: 1.5 }}>Hi 78° / Lo 54° • Wind 8 mph NW • UV 6</div>
                  <div style={{ fontSize: 8, color: T.textMuted, marginTop: 6, letterSpacing: 1 }}>LIVE WEATHER — SESSION 05</div>
                </div>
              </Panel>

              <Panel title="NEXUS STATUS" icon="◎">
                <div style={{ display: "grid", gap: 8 }}>
                  {[
                    { label: "MODEL LOADED", value: loadedModel,              color: apiColor  },
                    { label: "API BRIDGE",   value: apiStatus,               color: apiColor  },
                    { label: "WEBSOCKET",    value: wsStatus,                color: wsColor   },
                    { label: "VOICE",        value: voiceActive ? `ACTIVE — ${voiceStatus}` : "STANDBY", color: voiceActive ? T.green : T.textDim },
                    { label: "ADS-B",        value: dataStatus.flights === "ok" ? `${flights.length} TRACKED` : dataStatus.flights.toUpperCase(), color: dataStatus.flights === "ok" ? T.green : T.amber },
                    { label: "MARKETS",      value: dataStatus.markets === "ok" ? `${markets.length} INSTRUMENTS` : dataStatus.markets.toUpperCase(), color: dataStatus.markets === "ok" ? T.green : T.amber },
                    { label: "NEWS FEED",    value: dataStatus.news === "ok" ? `${news.length} ARTICLES` : dataStatus.news.toUpperCase(), color: dataStatus.news === "ok" ? T.green : T.amber },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", gap: 8 }}>
                      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>{s.label}</span>
                      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: s.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        );

      default: return null;
    }
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div id="nexus-root" style={{
      width: "100%", height: "100vh", background: T.bg0, color: T.text,
      fontFamily: "'Exo 2', 'Rajdhani', 'Segoe UI', monospace",
      display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
    }}>

      <style>{`
        @keyframes scroll-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        #nexus-root, #nexus-root * { box-sizing: border-box; margin: 0; padding: 0; }
        #nexus-root ::-webkit-scrollbar { width: 4px; }
        #nexus-root ::-webkit-scrollbar-track { background: ${T.bg0}; }
        #nexus-root ::-webkit-scrollbar-thumb { background: ${T.accentDim}; border-radius: 2px; }
        #nexus-root ::-webkit-scrollbar-thumb:hover { background: ${T.accent}; }
        #nexus-root .nexus-input::placeholder { color: ${T.textMuted}; }
        #nexus-root .nexus-nav-btn:hover { background: rgba(139,92,246,0.08) !important; }
        #nexus-root .nexus-layer-btn:hover { background: rgba(139,92,246,0.08) !important; }
        #nexus-root .nexus-mic-btn:hover { border-color: ${T.accentBright} !important; }
      `}</style>

      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 16px", background: T.bg1, borderBottom: `1px solid ${T.border}`,
        minHeight: 40, zIndex: 20, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `radial-gradient(circle at 40% 40%, ${T.accentBright}, ${T.accentDim})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 12px ${T.accentGlow}`, fontSize: 13, fontWeight: 800, color: "#fff",
          }}>N</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: T.accentSoft }}>GDLET NEXUS</div>
            <div style={{ fontSize: 8, letterSpacing: 2, color: T.textMuted, marginTop: -1 }}>GLOBAL INTELLIGENCE • COMMAND CENTER</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: wsColor, boxShadow: `0 0 5px ${wsColor}` }} />
            <span style={{ color: T.textDim, letterSpacing: 1 }}>NEXUS API</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: dataStatus.flights === "ok" ? T.green : T.amber, boxShadow: `0 0 5px ${T.amber}` }} />
            <span style={{ color: T.textDim, letterSpacing: 1 }}>ADS-B</span>
          </div>
          <div style={{
            background: riskIndex > 70 ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.15)",
            border: `1px solid ${riskIndex > 70 ? T.red : T.amber}`,
            padding: "2px 8px", borderRadius: 3,
            color: riskIndex > 70 ? T.red : T.amber,
            fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace",
          }}>GRI {riskIndex}/100</div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.accentSoft, letterSpacing: 2 }}>
            {utc} <span style={{ fontSize: 9, color: T.textMuted }}>UTC</span>
          </div>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>{dateStr}</div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* LEFT NAV */}
        <div style={{
          width: 52, background: T.bg1, borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 8, gap: 2, flexShrink: 0,
        }}>
          {navItems.map(n => (
            <button key={n.id} type="button" className="nexus-nav-btn" onClick={() => setActiveView(n.id)}
              style={{
                width: 42, padding: "8px 0", border: "none", borderRadius: 4, cursor: "pointer",
                background: activeView === n.id ? T.accentGlow : "transparent",
                borderLeft: activeView === n.id ? `2px solid ${T.accent}` : "2px solid transparent",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                transition: "all 0.2s", fontFamily: "inherit",
              }}>
              <span style={{ fontSize: 14, color: activeView === n.id ? T.accentBright : T.textMuted }}>{n.icon}</span>
              <span style={{ fontSize: 7, letterSpacing: 1, color: activeView === n.id ? T.accentSoft : T.textMuted, fontWeight: 600 }}>{n.label}</span>
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Copilot toggle */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 12 }}>
            <button type="button" onClick={() => setCopilotOpen(!copilotOpen)} style={{
              width: 36, height: 36, borderRadius: "50%",
              border: `1px solid ${copilotOpen ? T.accent : T.border}`,
              background: copilotOpen ? T.accentGlow : T.bg2,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
              boxShadow: copilotOpen ? `0 0 12px ${T.accentGlow}` : "none",
            }}>
              <span style={{ fontSize: 16, color: copilotOpen ? T.accentBright : T.textMuted }}>⬡</span>
            </button>
            <span style={{ fontSize: 7, color: T.textMuted, letterSpacing: 0.5, whiteSpace: "nowrap" }}>⌃ Space</span>
          </div>
        </div>

        {/* CENTER CONTENT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

          {/* Layer selector — CMD view */}
          {activeView === "command" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              background: T.bg1, borderBottom: `1px solid ${T.border}`,
              flexWrap: "wrap", flexShrink: 0,
            }}>
              {["hotspots", "flights", "shipping", "weather", "sanctions", "infra"].map(l => (
                <button key={l} type="button" className="nexus-layer-btn" onClick={() => setMapLayer(l)}
                  style={{
                    padding: "3px 10px",
                    border: `1px solid ${mapLayer === l ? T.accent : T.border}`,
                    borderRadius: 3, fontSize: 9, letterSpacing: 1, fontWeight: 600,
                    textTransform: "uppercase", cursor: "pointer",
                    background: mapLayer === l ? T.accentGlow : "transparent",
                    color: mapLayer === l ? T.accentBright : T.textMuted,
                    transition: "all 0.15s", fontFamily: "inherit",
                  }}>{l}</button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>
                LAYER: {mapLayer.toUpperCase()} • {HOTSPOTS.length} NODES •{" "}
                {dataStatus.flights === "ok" ? `${flights.length} TRACKED` : "ADS-B LOADING…"}
              </span>
            </div>
          )}

          {/* Flight header — AIR view */}
          {activeView === "flights" && (
            <div style={{
              padding: "8px 12px", background: T.bg1,
              borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>
                FLIGHT INTELLIGENCE — ADS-B LIVE VIA OPENSKY + ADS-B EXCHANGE
              </div>
              <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>
                {dataStatus.flights === "ok" ? `${flights.length} AIRBORNE` : "LOADING…"}
              </span>
            </div>
          )}

          {/* 3D Globe — always mounted; display toggled for map views */}
          <CesiumGlobe
            flights={flights}
            hotspots={HOTSPOTS}
            news={news}
            activeLayer={mapLayer}
            showHotspots={activeView === "command"}
            selectedHotspot={selectedHotspot}
            onHotspotSelect={setSelectedHotspot}
            style={{
              flex: 1,
              minHeight: 0,
              display: (activeView === "command" || activeView === "flights") ? "flex" : "none",
            }}
          />

          {/* Flight table — AIR view, below the globe */}
          {activeView === "flights" && (
            <div style={{
              background: T.bg1, borderTop: `1px solid ${T.border}`,
              padding: "6px 12px", maxHeight: 180, overflow: "auto", flexShrink: 0,
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {["CALLSIGN", "TYPE", "ALT", "SPEED", "ORIGIN"].map(h => (
                      <th key={h} style={{
                        padding: "4px 8px", textAlign: "left",
                        fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.textMuted,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flights.slice(0, 80).map(f => {
                    const tc = { SURV: T.amber, MIL: T.red, COM: T.accentSoft, CARGO: T.cyan };
                    return (
                      <tr key={f.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "5px 8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.text }}>
                          {f.callsign}
                        </td>
                        <td style={{ padding: "5px 8px" }}>
                          <span style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: 1,
                            color: tc[f.type] || T.textMuted,
                            background: `${tc[f.type] || T.textMuted}18`,
                            padding: "1px 6px", borderRadius: 2,
                          }}>{f.type}</span>
                        </td>
                        <td style={{ padding: "5px 8px", fontFamily: "'JetBrains Mono', monospace", color: T.textDim }}>{f.alt}</td>
                        <td style={{ padding: "5px 8px", fontFamily: "'JetBrains Mono', monospace", color: T.textDim }}>{f.speed}</td>
                        <td style={{ padding: "5px 8px", fontSize: 9, color: T.textDim }}>{f.origin}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Non-map views (news / markets / research / daily) */}
          {!["command", "flights"].includes(activeView) && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
              {renderCenter()}
            </div>
          )}

        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{
          width: 300, background: T.bg1, borderLeft: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0,
        }}>
          {/* News panel */}
          <Panel title="LIVE INTELLIGENCE FEED" icon="◉"
            badge={dataStatus.news === "ok" ? `${news.length}` : "…"}
            style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {["ALL", "BREAKING", "ESCALATING", "WATCH"].map(f => (
                <button key={f} type="button" onClick={() => setNewsFilter(f)} style={{
                  padding: "2px 7px",
                  border: `1px solid ${newsFilter === f ? T.accent : T.border}`,
                  borderRadius: 2, fontSize: 8, letterSpacing: 0.5, fontWeight: 600, cursor: "pointer",
                  background: newsFilter === f ? T.accentGlow : "transparent",
                  color: newsFilter === f ? T.accentBright : T.textMuted,
                  fontFamily: "inherit",
                }}>{f}</button>
              ))}
            </div>

            {filteredNews.length === 0 && (
              <div style={{ fontSize: 9, color: T.textMuted, padding: "8px 0", textAlign: "center" }}>
                {dataStatus.news === "loading" ? "Fetching…" :
                 dataStatus.news === "error"   ? "GDELT unavailable — retrying…" :
                 "No items"}
              </div>
            )}

            {filteredNews.map((n, i) => {
              const { label, color } = toneToLabel(n.tone);
              return (
                <div key={i}
                  style={{
                    padding: "7px 8px", marginBottom: 4, borderRadius: 4,
                    background: T.accentGlow2, border: `1px solid ${T.border}`,
                    cursor: "pointer", transition: "border-color 0.15s",
                  }}
                  onClick={() => n.url && window.open(n.url, "_blank")}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.borderActive}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{
                      fontSize: 7, fontWeight: 800, letterSpacing: 1,
                      color, background: `${color}18`, padding: "1px 5px", borderRadius: 2,
                    }}>{label}</span>
                    <span style={{ fontSize: 8, color: T.textMuted }}>{gdeltAge(n.seendate)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.text, lineHeight: 1.4, fontWeight: 500 }}>{n.title}</div>
                  <div style={{ fontSize: 8, color: T.textMuted, marginTop: 3 }}>{n.domain}</div>
                </div>
              );
            })}
          </Panel>

          {/* Markets panel */}
          <Panel title="MARKETS" icon="◎"
            badge={dataStatus.markets === "ok" ? "LIVE" : "…"}
            style={{ height: 260, flexShrink: 0 }}>
            {markets.length === 0
              ? <div style={{ fontSize: 9, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>Fetching prices…</div>
              : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {markets.map(m => (
                    <div key={m.sym} style={{ padding: "4px 6px", background: T.accentGlow2, borderRadius: 3, border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: T.accentSoft, letterSpacing: 1 }}>{m.sym}</span>
                        <Sparkline data={sparkData[m.sym] || makeSparkData(m.sym)} color={m.up ? T.green : T.red} w={36} h={12} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.text, marginTop: 2 }}>{m.val}</div>
                      <div style={{ fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: m.up ? T.green : T.red }}>{m.chg}</div>
                    </div>
                  ))}
                </div>
              )
            }
          </Panel>

          {/* Agenda panel */}
          <Panel title="TODAY'S AGENDA" icon="◷" style={{ height: 160, flexShrink: 0 }}>
            {AGENDA.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.accentSoft, minWidth: 38 }}>{a.time}</span>
                <span style={{ fontSize: 10, color: T.text, flex: 1 }}>{a.title}</span>
                <span style={{
                  fontSize: 7, letterSpacing: 0.5, padding: "1px 5px", borderRadius: 2,
                  background: a.tag === "travel" ? "rgba(248,113,113,0.15)" : T.accentGlow2,
                  color: a.tag === "travel" ? T.amber : T.textMuted,
                  fontWeight: 600, textTransform: "uppercase",
                }}>{a.tag}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      {/* COPILOT DRAWER */}
      {copilotOpen && (
        <div style={{
          position: "absolute", bottom: 0, left: 52, right: 0, height: 270,
          background: `linear-gradient(180deg, ${T.bg2}f5, ${T.bg0}fa)`,
          backdropFilter: "blur(16px)",
          borderTop: `1px solid ${T.borderActive}`,
          display: "flex", flexDirection: "column", zIndex: 30,
        }}>
          {/* Copilot header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: T.accentBright,
                boxShadow: `0 0 8px ${T.accentBright}`, animation: "pulse 2s infinite",
              }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>NEXUS COPILOT</span>
              <span style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1 }}>— CROSS-DOMAIN INTELLIGENCE SYNTHESIS</span>
              <div style={{
                width: 5, height: 5, borderRadius: "50%", background: wsColor,
                boxShadow: `0 0 4px ${wsColor}`, marginLeft: 4,
              }} />
              <span style={{ fontSize: 8, color: T.textMuted }}>{wsStatus}</span>
            </div>
            <button type="button" onClick={() => setCopilotOpen(false)}
              style={{ background: "none", border: "none", color: T.textMuted, fontSize: 16, cursor: "pointer" }}>×</button>
          </div>

          {/* Messages */}
          <div ref={copilotRef} style={{ flex: 1, overflow: "auto", padding: "10px 16px" }}>
            {copilotMessages.map((m, i) => (
              <div key={i} style={{ marginBottom: 8, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "76%", padding: "8px 12px", borderRadius: 6,
                  background: m.role === "user" ? T.accentGlow : T.accentGlow2,
                  border: `1px solid ${m.role === "user" ? T.accent : T.border}`,
                }}>
                  {m.role === "nexus" && (
                    <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, color: T.accentSoft, marginBottom: 3 }}>NEXUS</div>
                  )}
                  <div style={{ fontSize: 10.5, color: T.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.text}</div>
                </div>
              </div>
            ))}
            {copilotLoading && (
              <div style={{ marginBottom: 8, display: "flex" }}>
                <div style={{ padding: "8px 12px", borderRadius: 6, background: T.accentGlow2, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, color: T.accentSoft, marginBottom: 3 }}>NEXUS</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: T.accentSoft, letterSpacing: 1.5, animation: "pulse 1.5s infinite" }}>PROCESSING</span>
                    <div style={{ display: "inline-flex", gap: 3 }}>
                      {[0, 1, 2].map(d => (
                        <div key={d} style={{
                          width: 4, height: 4, borderRadius: "50%", background: T.accentSoft,
                          animation: `pulse 1.2s ${d * 0.2}s infinite`, display: "inline-block",
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Voice status bar */}
          {voiceActive && (
            <div style={{
              padding: "4px 16px", background: `rgba(139,92,246,0.08)`,
              borderTop: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: 9, color: T.textDim, letterSpacing: 1 }}>VOICE: {voiceStatus}</span>
            </div>
          )}

          {/* Input row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderTop: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: wsStatus === "CONNECTED" ? (copilotLoading ? T.amber : T.accentBright) : T.red,
              boxShadow: `0 0 4px ${wsStatus === "CONNECTED" ? T.accentBright : T.red}`,
            }} />

            <button type="button" className="nexus-mic-btn" onClick={toggleVoice}
              disabled={wsStatus !== "CONNECTED"}
              style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                border: `1px solid ${voiceActive ? T.accent : T.border}`,
                background: voiceActive ? T.accentGlow : "transparent",
                cursor: wsStatus === "CONNECTED" ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", fontSize: 13,
                opacity: wsStatus === "CONNECTED" ? 1 : 0.4,
              }}>🎙</button>

            <input
              className="nexus-input"
              value={copilotInput}
              onChange={e => setCopilotInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendCopilot()}
              placeholder={copilotLoading ? "NEXUS is processing…" : voiceActive ? "Voice active — or type here…" : "Ask NEXUS anything…"}
              disabled={copilotLoading}
              style={{
                flex: 1, background: T.accentGlow2, border: `1px solid ${T.border}`,
                borderRadius: 4, padding: "8px 12px", color: T.text, fontSize: 11,
                outline: "none", fontFamily: "'Exo 2', sans-serif",
                opacity: copilotLoading ? 0.5 : 1,
              }}
              onFocus={e => { if (!copilotLoading) e.target.style.borderColor = T.accent; }}
              onBlur={e => { e.target.style.borderColor = T.border; }}
            />

            <button type="button" onClick={sendCopilot} disabled={copilotLoading} style={{
              padding: "6px 16px", background: copilotLoading ? T.accentDim : T.accent,
              border: "none", borderRadius: 4, color: "#fff", fontSize: 10, fontWeight: 700,
              letterSpacing: 1, cursor: copilotLoading ? "not-allowed" : "pointer",
              boxShadow: copilotLoading ? "none" : `0 0 12px ${T.accentGlow}`,
              opacity: copilotLoading ? 0.5 : 1, fontFamily: "inherit",
            }}>SEND</button>
          </div>
        </div>
      )}

      {/* BOTTOM TICKER */}
      <div style={{
        display: "flex", alignItems: "center", padding: "4px 16px",
        background: T.bg1, borderTop: `1px solid ${T.border}`,
        overflow: "hidden", minHeight: 24, flexShrink: 0,
      }}>
        <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, color: T.accentDim, marginRight: 12, flexShrink: 0 }}>TICKER</span>
        <div style={{ overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
          {markets.length > 0 ? (
            <div style={{ display: "inline-block", animation: "scroll-ticker 45s linear infinite" }}>
              {[...markets, ...markets].map((m, i) => (
                <span key={i} style={{ marginRight: 24, fontSize: 9, letterSpacing: 0.5 }}>
                  <span style={{ color: T.accentSoft, fontWeight: 600 }}>{m.sym}</span>
                  <span style={{ color: T.textDim, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>{m.val}</span>
                  <span style={{ color: m.up ? T.green : T.red, marginLeft: 4, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{m.chg}</span>
                </span>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>FETCHING LIVE MARKET DATA…</span>
          )}
        </div>
        <span style={{ fontSize: 7, color: T.textMuted, letterSpacing: 1, flexShrink: 0, marginLeft: 12 }}>NEXUS v0.5.0 • SESSION 04→05</span>
      </div>
    </div>
  );
}
