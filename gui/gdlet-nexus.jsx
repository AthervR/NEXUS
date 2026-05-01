import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── GDLET NEXUS — AI Command Center ────────────────────────────────────────
// Deep-space purple-instrumented operational intelligence GUI
// For NEXUS Project by athervrishi

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

// ─── SIMULATED DATA ─────────────────────────────────────────────────────────
const NEWS_ITEMS = [
  { id: 1, label: "BREAKING", color: T.red, title: "Taiwan Strait: PLA Navy exercises extended 48hrs — shipping rerouting via Luzon", region: "Asia-Pacific", time: "4m ago", severity: 5 },
  { id: 2, label: "MARKET-MOVING", color: T.amber, title: "ECB signals emergency rate corridor discussion amid EUR/USD volatility spike", region: "Europe", time: "12m ago", severity: 4 },
  { id: 3, label: "ESCALATING", color: T.red, title: "Red Sea: Houthi drone swarm detected — 3 commercial vessels diverted", region: "Middle East", time: "18m ago", severity: 5 },
  { id: 4, label: "INFRASTRUCTURE", color: T.cyan, title: "Suez Canal throughput down 34% MTD — container rates climbing", region: "Global", time: "25m ago", severity: 3 },
  { id: 5, label: "EMERGING", color: T.accentSoft, title: "TSMC Arizona fab yield rates reportedly exceeding projections — semiconductor supply shift", region: "North America", time: "31m ago", severity: 3 },
  { id: 6, label: "WATCH", color: T.amber, title: "Nigeria crude output disruptions — Bonny Light loadings delayed 5+ days", region: "Africa", time: "38m ago", severity: 3 },
  { id: 7, label: "TRAVEL IMPACT", color: T.cyan, title: "Frankfurt Airport: Lufthansa ground crew strike confirmed Apr 16–17", region: "Europe", time: "42m ago", severity: 2 },
  { id: 8, label: "BREAKING", color: T.red, title: "South China Sea: Philippine Coast Guard reports laser incident near Scarborough", region: "Asia-Pacific", time: "51m ago", severity: 4 },
];

const MARKETS = [
  { sym: "SPX", name: "S&P 500", val: "5,842.31", chg: "+0.67%", up: true },
  { sym: "NDQ", name: "NASDAQ", val: "18,291.04", chg: "+1.12%", up: true },
  { sym: "BTC", name: "Bitcoin", val: "97,421", chg: "+2.34%", up: true },
  { sym: "ETH", name: "Ethereum", val: "3,812", chg: "+1.89%", up: true },
  { sym: "EUR", name: "EUR/USD", val: "1.0834", chg: "-0.42%", up: false },
  { sym: "OIL", name: "Brent Crude", val: "87.62", chg: "+3.14%", up: true },
  { sym: "GLD", name: "Gold", val: "3,412", chg: "+0.28%", up: true },
  { sym: "VIX", name: "VIX", val: "21.34", chg: "+8.21%", up: true },
  { sym: "DXY", name: "Dollar Index", val: "104.82", chg: "+0.15%", up: true },
  { sym: "UST", name: "US 10Y Yield", val: "4.38%", chg: "+2bp", up: true },
];

const FLIGHTS = [
  { id: "f1", call: "FORTE12", type: "SURV", lat: 14.5, lng: 44.2, alt: "55,000ft", hdg: "NE", note: "RQ-4 Global Hawk — Red Sea ISR pattern" },
  { id: "f2", call: "DUKE41", type: "MIL", lat: 25.3, lng: 121.5, alt: "28,000ft", hdg: "S", note: "P-8A Poseidon — Taiwan Strait patrol" },
  { id: "f3", call: "UAE203", type: "COM", lat: 33.8, lng: 51.4, alt: "38,000ft", hdg: "W", note: "DXB→FRA — Rerouting south of conflict zone" },
  { id: "f4", call: "LAGR225", type: "CARGO", lat: 6.5, lng: 3.4, alt: "32,000ft", hdg: "N", note: "Lagos→AMS — Heavy cargo, oil equipment" },
];

const HOTSPOTS = [
  { id: "h1", name: "Taiwan Strait", lat: 24.5, lng: 119, risk: 92, type: "military" },
  { id: "h2", name: "Red Sea / Bab el-Mandeb", lat: 13.5, lng: 43, risk: 88, type: "conflict" },
  { id: "h3", name: "South China Sea", lat: 11, lng: 115, risk: 75, type: "territorial" },
  { id: "h4", name: "Strait of Hormuz", lat: 26.5, lng: 56.5, risk: 65, type: "chokepoint" },
  { id: "h5", name: "Suez Canal", lat: 30.5, lng: 32.3, risk: 58, type: "infrastructure" },
  { id: "h6", name: "Niger Delta", lat: 5.5, lng: 6.5, risk: 52, type: "disruption" },
  { id: "h7", name: "Eastern Ukraine", lat: 48.5, lng: 37.5, risk: 85, type: "conflict" },
];

const AGENDA = [
  { time: "09:00", title: "Stand-up: NEXUS sprint review", tag: "work" },
  { time: "11:30", title: "Hardware delivery — OCuLink cable", tag: "nexus" },
  { time: "14:00", title: "Lab session: XArm 1S calibration", tag: "lab" },
  { time: "16:00", title: "Review Vulkan kernel patches for Qwen3", tag: "research" },
  { time: "19:00", title: "Flight: SFO → FRA (check disruption)", tag: "travel" },
];

// ─── SVG WORLD MAP (recognizable continent paths) ───────────────────────────
// viewBox 600×310: lng → x = ((lng+180)/360)*560+20, lat → y = ((90-lat)/180)*300+5
const WorldMapPaths = () => (
  <g fill={T.bg3} stroke={T.accentDim} strokeWidth="0.3" opacity="0.6">
    {/* North America mainland */}
    <path d="M80,62 L88,56 L100,50 L112,44 L128,40 L148,42 L160,50 L170,55
             L178,64 L182,72 L186,82 L184,90 L178,98 L170,108 L164,118
             L156,126 L148,132 L142,136 L136,140 L128,138 L122,130
             L118,122 L112,114 L106,106 L100,96 L92,84 L84,72 Z" />
    {/* Central America + Mexico */}
    <path d="M112,114 L118,122 L128,138 L136,140 L142,148 L144,156
             L140,162 L134,166 L128,162 L122,154 L118,146 L112,138
             L108,130 L104,122 L106,116 Z" />
    {/* Alaska */}
    <path d="M68,44 L78,38 L90,36 L98,40 L100,50 L92,52 L82,50 L72,48 Z" />
    {/* Canada Arctic */}
    <path d="M128,28 L140,24 L156,26 L168,30 L178,36 L182,44 L176,48
             L164,46 L148,42 L136,38 Z" />
    {/* Greenland */}
    <path d="M196,24 L210,18 L222,22 L228,32 L224,44 L216,52 L206,54
             L198,48 L194,38 L192,30 Z" />
    {/* South America */}
    <path d="M152,180 L162,172 L172,170 L182,176 L188,186 L192,198
             L190,212 L186,226 L182,240 L178,252 L172,264 L166,274
             L160,278 L154,272 L150,260 L148,246 L146,232 L144,218
             L146,204 L148,192 Z" />
    {/* Europe mainland */}
    <path d="M268,52 L276,48 L288,44 L298,46 L308,50 L316,56
             L322,64 L326,72 L322,80 L316,86 L308,90 L298,92
             L288,88 L280,82 L274,74 L268,66 Z" />
    {/* Scandinavia */}
    <path d="M288,28 L296,24 L306,28 L312,36 L314,46 L308,50
             L298,46 L292,38 L288,32 Z" />
    {/* UK + Ireland */}
    <path d="M262,54 L268,48 L274,50 L276,58 L272,64 L266,66 L260,62 Z" />
    {/* Iberian */}
    <path d="M262,78 L272,74 L278,80 L276,88 L268,92 L260,88 L258,82 Z" />
    {/* Italy */}
    <path d="M292,78 L296,74 L300,80 L298,90 L294,96 L290,92 L288,84 Z" />
    {/* Africa */}
    <path d="M272,110 L282,104 L296,102 L312,104 L326,110 L336,120
             L342,134 L344,150 L342,168 L338,184 L330,200 L320,212
             L308,218 L296,220 L284,216 L274,206 L268,192 L264,176
             L262,160 L262,144 L264,128 L268,118 Z" />
    {/* Middle East */}
    <path d="M326,82 L338,78 L350,82 L360,90 L364,100 L360,110
             L352,116 L342,118 L334,112 L328,104 L324,94 Z" />
    {/* Arabian Peninsula */}
    <path d="M334,112 L346,108 L356,114 L362,124 L358,136 L348,142
             L338,138 L330,128 L328,118 Z" />
    {/* Russia / Central Asia */}
    <path d="M322,40 L340,34 L362,30 L386,28 L410,30 L434,34
             L454,40 L468,48 L476,56 L478,66 L472,74 L462,78
             L448,76 L432,72 L414,68 L396,66 L378,64 L360,62
             L344,58 L332,52 L326,46 Z" />
    {/* India + South Asia */}
    <path d="M376,96 L388,92 L400,96 L408,106 L410,118 L406,132
             L398,144 L390,150 L382,146 L376,136 L372,124 L370,112
             L372,102 Z" />
    {/* China / East Asia */}
    <path d="M414,58 L430,54 L446,58 L458,66 L464,76 L460,86
             L452,94 L442,100 L430,104 L418,100 L408,94 L402,86
             L400,78 L404,68 L410,62 Z" />
    {/* Southeast Asia */}
    <path d="M418,114 L430,108 L442,112 L448,122 L444,132
             L436,138 L426,136 L418,128 L414,120 Z" />
    {/* Indonesia */}
    <path d="M420,156 L432,150 L446,152 L460,156 L472,162
             L468,170 L456,174 L442,176 L428,172 L418,166 Z" />
    {/* Japan */}
    <path d="M470,64 L476,58 L482,62 L484,72 L480,82 L474,86
             L468,80 L466,70 Z" />
    {/* Australia */}
    <path d="M434,200 L450,192 L468,190 L484,196 L496,206
             L498,220 L492,234 L482,244 L468,248 L454,246
             L442,238 L434,226 L432,212 Z" />
    {/* New Zealand */}
    <path d="M510,244 L516,238 L520,246 L518,256 L512,260 L508,254 Z" />
  </g>
);

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

const Pulse = ({ x, y, color = T.red, size = 6 }) => (
  <g>
    <circle cx={x} cy={y} r={size} fill={color} opacity="0.2">
      <animate attributeName="r" values={`${size};${size * 3};${size}`} dur="2.5s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite" />
    </circle>
    <circle cx={x} cy={y} r={size * 0.5} fill={color} opacity="0.8" />
  </g>
);

const FlightIcon = ({ x, y, hdg, type }) => {
  const colors = { SURV: T.amber, MIL: T.red, COM: T.accentSoft, CARGO: T.cyan };
  const c = colors[type] || T.textDim;
  const angles = { NE: -45, S: 180, W: 270, N: 0, E: 90, SE: 135, SW: 225, NW: -45 };
  const a = angles[hdg] || 0;
  return (
    <g transform={`translate(${x},${y}) rotate(${a})`}>
      <polygon points="0,-5 3,4 0,2 -3,4" fill={c} opacity="0.9" />
      <line x1="0" y1="2" x2="0" y2="14" stroke={c} strokeWidth="0.5" opacity="0.3" strokeDasharray="2,2" />
    </g>
  );
};

const Panel = ({ title, children, style, icon, badge, onHeaderClick, collapsed = false }) => (
  <div style={{
    background: `linear-gradient(135deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    ...style,
  }}>
    <div
      onClick={onHeaderClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        background: T.accentGlow2,
        borderBottom: `1px solid ${T.border}`,
        cursor: onHeaderClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <span style={{ fontSize: 13, opacity: 0.7 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: T.accentSoft }}>{title}</span>
      </div>
      {badge && (
        <span style={{
          fontSize: 9, background: T.accent, color: "#fff", padding: "1px 6px",
          borderRadius: 3, fontWeight: 700, letterSpacing: 1,
        }}>{badge}</span>
      )}
    </div>
    {!collapsed && (
      // FIX #8: minHeight: 0 on inner scroll container so it correctly caps in flex column
      <div style={{ flex: 1, overflow: "auto", padding: "8px 10px", minHeight: 0 }}>
        {children}
      </div>
    )}
  </div>
);

const Sparkline = ({ data, color, w = 60, h = 16 }) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
};

const genSparkData = (len = 12) => Array.from({ length: len }, () => Math.random() * 100);

// MapView hoisted out of component body — stable reference across renders.
// instanceId prop makes SVG <defs> ids unique when MapView is mounted twice.
// Unimplemented-layer overlay + flightsOnly bottom-telemetry gate live here.
const MapView = ({
  flightsOnly = false,
  mapLayer,
  selectedHotspot,
  setSelectedHotspot,
  lngToX,
  latToY,
  instanceId = "a",
}) => (
  <div style={{ flex: 1, position: "relative", overflow: "hidden", background: T.bg0, minHeight: 0 }}>
    <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0, opacity: 0.04 }}>
      <defs>
        <pattern id={`grid-${instanceId}`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke={T.accentSoft} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#grid-${instanceId})`} />
    </svg>

    <svg viewBox="0 0 600 310" style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id={`glow-${instanceId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={T.accent} stopOpacity="0.08" />
          <stop offset="100%" stopColor={T.bg0} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="310" fill={`url(#glow-${instanceId})`} />
      <WorldMapPaths />

      {[0, 30, 60, -30, -60].map(lat => (
        <line key={`lat${lat}`} x1="20" y1={latToY(lat)} x2="580" y2={latToY(lat)}
          stroke={T.accentDim} strokeWidth="0.2" opacity="0.2" strokeDasharray="4,8" />
      ))}
      {[0, 60, 120, -60, -120, 180].map(lng => (
        <line key={`lng${lng}`} x1={lngToX(lng)} y1="5" x2={lngToX(lng)} y2="305"
          stroke={T.accentDim} strokeWidth="0.2" opacity="0.2" strokeDasharray="4,8" />
      ))}

      {/* Hotspots */}
      {!flightsOnly && (mapLayer === "hotspots" || mapLayer === "flights") && HOTSPOTS.map(h => (
        <g key={h.id} style={{ cursor: "pointer" }} onClick={() => setSelectedHotspot(selectedHotspot?.id === h.id ? null : h)}>
          <Pulse x={lngToX(h.lng)} y={latToY(h.lat)}
            color={h.risk > 80 ? T.red : h.risk > 60 ? T.amber : T.accentSoft}
            size={h.risk > 80 ? 5 : 4} />
          <text x={lngToX(h.lng)} y={latToY(h.lat) - 10}
            fill={T.textDim} fontSize="5.5" textAnchor="middle" fontFamily="'JetBrains Mono', monospace"
            fontWeight="600" letterSpacing="0.5">{h.name}</text>
        </g>
      ))}

      {/* Flights */}
      {(flightsOnly || mapLayer === "flights" || mapLayer === "hotspots") && FLIGHTS.map(f => (
        <g key={f.id}>
          <FlightIcon x={lngToX(f.lng)} y={latToY(f.lat)} hdg={f.hdg} type={f.type} />
          <text x={lngToX(f.lng) + 6} y={latToY(f.lat) - 2}
            fill={T.textMuted} fontSize="4.5" fontFamily="'JetBrains Mono', monospace">{f.call}</text>
        </g>
      ))}

      {!flightsOnly && (
        <>
          <line x1={lngToX(43)} y1={latToY(13.5)} x2={lngToX(56.5)} y2={latToY(26.5)}
            stroke={T.red} strokeWidth="0.4" opacity="0.2" strokeDasharray="3,4" />
          <line x1={lngToX(119)} y1={latToY(24.5)} x2={lngToX(115)} y2={latToY(11)}
            stroke={T.amber} strokeWidth="0.4" opacity="0.2" strokeDasharray="3,4" />
        </>
      )}
    </svg>

    {/* Overlay for unimplemented layers */}
    {["shipping", "weather", "sanctions", "infra"].includes(mapLayer) && !flightsOnly && (
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        background: `${T.bg2}cc`, border: `1px solid ${T.border}`,
        borderRadius: 6, padding: "10px 20px", textAlign: "center",
        pointerEvents: "none", backdropFilter: "blur(4px)",
      }}>
        <div style={{ fontSize: 10, color: T.accentSoft, letterSpacing: 2, fontWeight: 700 }}>
          {mapLayer.toUpperCase()} LAYER
        </div>
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4, letterSpacing: 1 }}>
          DATA INTEGRATION — SESSION 04
        </div>
      </div>
    )}

    {/* Hotspot Detail Drawer */}
    {selectedHotspot && !flightsOnly && (
      <div style={{
        position: "absolute", top: 12, right: 12, width: 280,
        background: `linear-gradient(135deg, ${T.bg2}ee, ${T.bg1}ee)`,
        backdropFilter: "blur(12px)",
        border: `1px solid ${T.borderActive}`,
        borderRadius: 6, padding: 14, zIndex: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{selectedHotspot.name}</div>
            <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginTop: 2, textTransform: "uppercase" }}>{selectedHotspot.type}</div>
          </div>
          <div style={{
            background: selectedHotspot.risk > 80 ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.2)",
            border: `1px solid ${selectedHotspot.risk > 80 ? T.red : T.amber}`,
            padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 700,
            color: selectedHotspot.risk > 80 ? T.red : T.amber,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{selectedHotspot.risk}</div>
        </div>

        <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.5, marginBottom: 10 }}>
          Active monitoring zone. AI-detected signal convergence across military, economic, and logistical domains. {selectedHotspot.risk > 80 ? "Elevated threat posture — recommend continuous monitoring." : "Moderate activity — standard watch protocol."}
        </div>

        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 8, letterSpacing: 1, color: T.textMuted, marginBottom: 6, fontWeight: 600 }}>RELATED SIGNALS</div>
          {NEWS_ITEMS.filter(n => n.severity >= 4).slice(0, 3).map((n, i) => (
            <div key={i} style={{ fontSize: 9, color: T.textDim, padding: "3px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: n.color, fontSize: 7, fontWeight: 700, marginRight: 4 }}>●</span>
              {n.title.slice(0, 70)}…
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {["DOSSIER", "WATCHLIST", "ALERT"].map(a => (
            <button key={a} type="button" style={{
              flex: 1, padding: "4px 0", border: `1px solid ${T.border}`, borderRadius: 3,
              background: "transparent", color: T.accentSoft, fontSize: 8, letterSpacing: 1,
              fontWeight: 600, cursor: "pointer",
            }}>{a}</button>
          ))}
        </div>

        <button type="button" onClick={() => setSelectedHotspot(null)} style={{
          position: "absolute", top: 8, right: 8, background: "none", border: "none",
          color: T.textMuted, fontSize: 14, cursor: "pointer", padding: 4,
        }}>×</button>
      </div>
    )}

    {/* Bottom telemetry only when not flightsOnly */}
    {!flightsOnly && (
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: `linear-gradient(transparent, ${T.bg0}dd)`,
        padding: "20px 16px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "end",
      }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {HOTSPOTS.slice(0, 4).map(h => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: h.risk > 80 ? T.red : h.risk > 60 ? T.amber : T.green,
                boxShadow: `0 0 4px ${h.risk > 80 ? T.red : h.risk > 60 ? T.amber : T.green}`,
              }} />
              <span style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.5 }}>{h.name}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                color: h.risk > 80 ? T.red : h.risk > 60 ? T.amber : T.green,
              }}>{h.risk}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1 }}>
          GEOSPATIAL ENGINE v0.1 • PROJECTION: EQUIRECTANGULAR • REFRESH: 30s
        </div>
      </div>
    )}
  </div>
);

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function GDLETNexus() {
  const [activeView, setActiveView] = useState("command");
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState([
    { role: "nexus", text: "NEXUS online. All modules nominal. Monitoring 147 global feeds across 42 languages. 3 active threat corridors detected. Ready for tasking." }
  ]);
  const [clock, setClock] = useState(new Date());
  const [newsFilter, setNewsFilter] = useState("ALL");
  const [centerNewsFilter, setCenterNewsFilter] = useState("ALL");
  const [mapLayer, setMapLayer] = useState("hotspots");
  const [showResearchMsg, setShowResearchMsg] = useState(false);
  const [apiStatus, setApiStatus] = useState("CHECKING");
  const [loadedModel, setLoadedModel] = useState("—");

  const copilotRef = useRef(null);
  const copilotLoadingRef = useRef(false);

  // Memoize sparkline data (stable across renders)
  const sparkData = useMemo(() =>
    Object.fromEntries(MARKETS.map(m => [m.sym, genSparkData()])),
  []);

  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // FIX #2 + #3: reset transient state on navigation away from origin view
  useEffect(() => {
    if (activeView !== "research") setShowResearchMsg(false);
    if (activeView !== "command") setSelectedHotspot(null);
  }, [activeView]);

  // Auto-scroll copilot
  useEffect(() => {
    if (copilotRef.current) copilotRef.current.scrollTop = copilotRef.current.scrollHeight;
  }, [copilotMessages, copilotLoading]);

  // Merged keyboard handler — Ctrl/Cmd+Space toggles copilot, Escape prioritizes copilot close
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

  // Ping LM Studio for real status + loaded model
  useEffect(() => {
    fetch("http://localhost:1234/v1/models")
      .then(r => r.json())
      .then(data => {
        setApiStatus("ONLINE");
        const first = data.data?.[0]?.id ?? "unknown";
        setLoadedModel(first);
      })
      .catch(() => {
        setApiStatus("OFFLINE");
        setLoadedModel("—");
      });
  }, []);

  // FIX #1: sendCopilot now includes full conversation history (capped to last 10)
  const sendCopilot = useCallback(async () => {
    if (!copilotInput.trim() || copilotLoadingRef.current) return;
    const userMsg = copilotInput.trim();

    // Build history from existing copilotMessages BEFORE we add the new user message
    const history = copilotMessages
      .filter(m => m.role === "user" || m.role === "nexus")
      .map(m => ({
        role: m.role === "nexus" ? "assistant" : "user",
        content: m.text,
      }));

    setCopilotMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setCopilotInput("");
    copilotLoadingRef.current = true;
    setCopilotLoading(true);
    try {
      const res = await fetch("http://localhost:1234/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.2-3b-instruct",
          messages: [
            { role: "system", content: "You are NEXUS, an advanced AI intelligence assistant monitoring global events, markets, flights, and the user's personal schedule. You specialize in cross-domain synthesis: connecting geopolitical developments to market movements, travel disruptions, and personal impact. Be concise, precise, and analyst-like. Never guess — if uncertain, say so." },
            ...history.slice(-10),
            { role: "user", content: userMsg }
          ],
          temperature: 0.7,
          max_tokens: 500,
        })
      });
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content ?? "[No response from model]";
      setCopilotMessages(prev => [...prev, { role: "nexus", text: reply }]);
    } catch (err) {
      setCopilotMessages(prev => [...prev, {
        role: "nexus",
        text: "[ERROR] Cannot reach NEXUS API at localhost:1234. Verify LM Studio is running with local server enabled on port 1234."
      }]);
    } finally {
      copilotLoadingRef.current = false;
      setCopilotLoading(false);
    }
  }, [copilotInput, copilotMessages]);

  // Stable callbacks for projection
  const lngToX = useCallback((lng) => ((lng + 180) / 360) * 560 + 20, []);
  const latToY = useCallback((lat) => ((90 - lat) / 180) * 300 + 5, []);

  const filteredNews = newsFilter === "ALL" ? NEWS_ITEMS : NEWS_ITEMS.filter(n => n.label === newsFilter);
  const centerFilteredNews = centerNewsFilter === "ALL" ? NEWS_ITEMS : NEWS_ITEMS.filter(n => n.label === centerNewsFilter);

  const navItems = [
    { id: "command", icon: "◉", label: "CMD" },
    { id: "news", icon: "▤", label: "FEED" },
    { id: "markets", icon: "◈", label: "MKT" },
    { id: "flights", icon: "△", label: "AIR" },
    { id: "research", icon: "◇", label: "LAB" },
    { id: "daily", icon: "☰", label: "DAY" },
  ];

  const riskIndex = 73;
  const utc = clock.toISOString().slice(11, 19);
  const dateStr = clock.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  const apiStatusColor = apiStatus === "ONLINE" ? T.green : apiStatus === "OFFLINE" ? T.red : T.amber;

  // ─── VIEW SWITCHING ───────────────────────────────────────────────────────
  const renderCenter = () => {
    switch (activeView) {

      case "command":
        // FIX #6: explicit flex column wrapper replaces fragment so layer strip + MapView
        // always behave as direct children of a flex container with minHeight: 0.
        return (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              background: T.bg1, borderBottom: `1px solid ${T.border}`, flexWrap: "wrap",
            }}>
              {["hotspots", "flights", "shipping", "weather", "sanctions", "infra"].map(l => (
                <button key={l} type="button" className="nexus-layer-btn" onClick={() => setMapLayer(l)}
                  style={{
                    padding: "3px 10px", border: `1px solid ${mapLayer === l ? T.accent : T.border}`,
                    borderRadius: 3, fontSize: 9, letterSpacing: 1, fontWeight: 600,
                    textTransform: "uppercase", cursor: "pointer",
                    background: mapLayer === l ? T.accentGlow : "transparent",
                    color: mapLayer === l ? T.accentBright : T.textMuted,
                    transition: "all 0.15s",
                  }}>{l}</button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>
                LAYER: {mapLayer.toUpperCase()} • {HOTSPOTS.length} NODES • {FLIGHTS.length} TRACKED
              </span>
            </div>
            <MapView
              instanceId="cmd"
              mapLayer={mapLayer}
              selectedHotspot={selectedHotspot}
              setSelectedHotspot={setSelectedHotspot}
              lngToX={lngToX}
              latToY={latToY}
            />
          </div>
        );

      case "news":
        return (
          <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 0 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>LIVE INTELLIGENCE FEED</div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginTop: 2 }}>{NEWS_ITEMS.length} SIGNALS ACROSS 42 LANGUAGES • REAL-TIME</div>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {["ALL", "BREAKING", "MARKET-MOVING", "ESCALATING", "INFRASTRUCTURE", "EMERGING", "WATCH", "TRAVEL IMPACT"].map(f => (
                <button key={f} type="button" onClick={() => setCenterNewsFilter(f)} style={{
                  padding: "4px 12px", border: `1px solid ${centerNewsFilter === f ? T.accent : T.border}`,
                  borderRadius: 3, fontSize: 9, letterSpacing: 1, fontWeight: 600, cursor: "pointer",
                  background: centerNewsFilter === f ? T.accentGlow : "transparent",
                  color: centerNewsFilter === f ? T.accentBright : T.textMuted,
                }}>{f}</button>
              ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {centerFilteredNews.map(n => (
                <div key={n.id} style={{
                  padding: "12px 14px", borderRadius: 6,
                  background: T.accentGlow2, border: `1px solid ${T.border}`,
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.borderActive}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, color: n.color, background: `${n.color}15`, padding: "2px 8px", borderRadius: 3 }}>{n.label}</span>
                      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 0.5 }}>{n.region}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {Array.from({ length: n.severity }).map((_, i) => (
                        <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: n.severity >= 4 ? T.red : T.amber }} />
                      ))}
                      <span style={{ fontSize: 9, color: T.textMuted }}>{n.time}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, fontWeight: 500 }}>{n.title}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case "markets":
        return (
          <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 0 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>MARKETS INTELLIGENCE</div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginTop: 2 }}>CROSS-DOMAIN MACRO REASONING ENGINE • LIVE</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 16 }}>
              {MARKETS.map(m => (
                <div key={m.sym} style={{
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
                    <Sparkline data={sparkData[m.sym]} color={m.up ? T.green : T.red} w={50} h={16} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>{m.val}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: m.up ? T.green : T.red, marginTop: 2 }}>{m.chg}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 14px", background: "rgba(248,113,113,0.06)", border: `1px solid rgba(248,113,113,0.15)`, borderRadius: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.amber, marginBottom: 4 }}>AI CROSS-DOMAIN INSIGHT</div>
              <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.6 }}>
                Brent +3.14% correlates with Red Sea vessel diversions. VIX elevated — ECB signaling driving EUR vol. Semiconductor names may gap on TSMC yield news. Oil-sensitive airline exposure warrants monitoring ahead of SFO→FRA departure.
              </div>
            </div>
          </div>
        );

      case "flights":
        // FIX #7: outer flights container + MapView inherits its own minHeight: 0
        // (already present in MapView's outer div). Explicit flex + minHeight: 0 on
        // this container ensures the map does not collapse when the table is tall.
        return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            <div style={{ padding: "8px 12px", background: T.bg1, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>FLIGHT INTELLIGENCE — TRACKED AIRCRAFT</div>
              <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>{FLIGHTS.length} ACTIVE</span>
            </div>
            <MapView
              instanceId="air"
              flightsOnly
              mapLayer={mapLayer}
              selectedHotspot={selectedHotspot}
              setSelectedHotspot={setSelectedHotspot}
              lngToX={lngToX}
              latToY={latToY}
            />
            <div style={{ background: T.bg1, borderTop: `1px solid ${T.border}`, padding: "8px 12px", maxHeight: 160, overflow: "auto", flexShrink: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {["CALLSIGN", "TYPE", "ALT", "HDG", "STATUS"].map(h => (
                      <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FLIGHTS.map(f => {
                    const tc = { SURV: T.amber, MIL: T.red, COM: T.accentSoft, CARGO: T.cyan };
                    return (
                      <tr key={f.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.text }}>{f.call}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: tc[f.type], background: `${tc[f.type]}15`, padding: "1px 6px", borderRadius: 2 }}>{f.type}</span>
                        </td>
                        <td style={{ padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", color: T.textDim }}>{f.alt}</td>
                        <td style={{ padding: "6px 8px", color: T.textDim }}>{f.hdg}</td>
                        <td style={{ padding: "6px 8px", fontSize: 9, color: T.textDim }}>{f.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "research":
        return (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg0, minHeight: 0 }}>
            <div style={{ textAlign: "center", maxWidth: 440 }}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>◇</div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: T.accentSoft, marginBottom: 8 }}>LAB WORKSPACE</div>
              <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1.6, letterSpacing: 0.5, marginBottom: 20 }}>
                Research workspace, dossier builder, and knowledge synthesis engine. Notes, saved searches, entity graphs, and AI-generated briefs.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {["MORNING BRIEF", "THREAT BRIEF", "COUNTRY DOSSIER", "TRIP BRIEF"].map(t => (
                  <button
                    key={t}
                    type="button"
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
                  Coming in Session 04 — research workspace in development
                </div>
              )}
              <div style={{ marginTop: 24, fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>COMING IN SESSION 04</div>
            </div>
          </div>
        );

      case "daily":
        return (
          <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: T.accentSoft, marginBottom: 16 }}>DAILY OPERATIONS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Panel title="SCHEDULE" icon="☰" badge={`${AGENDA.length}`} style={{ gridColumn: "1 / -1" }}>
                {AGENDA.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.accentSoft, minWidth: 48 }}>{a.time}</span>
                    <span style={{ fontSize: 11, color: T.text, flex: 1 }}>{a.title}</span>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "2px 8px", borderRadius: 3,
                      background: a.tag === "travel" ? "rgba(248,113,113,0.15)" : T.accentGlow2,
                      color: a.tag === "travel" ? T.amber : T.textMuted, fontWeight: 600, textTransform: "uppercase",
                    }}>{a.tag}</span>
                  </div>
                ))}
              </Panel>
              <Panel title="WEATHER" icon="☁" badge="LOCAL">
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{ fontSize: 28, fontWeight: 300, fontFamily: "'JetBrains Mono', monospace", color: T.text }}>72°F</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>Livermore, CA — Clear</div>
                  <div style={{ fontSize: 9, color: T.textMuted, marginTop: 8, lineHeight: 1.5 }}>Hi 78° / Lo 54° • Wind 8 mph NW • UV 6</div>
                </div>
              </Panel>
              <Panel title="NEXUS STATUS" icon="◉">
                <div style={{ display: "grid", gap: 8 }}>
                  {[
                    { label: "MODEL LOADED", value: loadedModel, color: apiStatusColor },
                    { label: "API STATUS", value: apiStatus, color: apiStatusColor },
                    { label: "FEEDS ACTIVE", value: "147", color: T.accentSoft },
                    { label: "ALERTS PENDING", value: "3", color: T.amber },
                    { label: "UPTIME", value: "4h 23m", color: T.textDim },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", gap: 8 }}>
                      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>{s.label}</span>
                      <span style={{
                        fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: s.color,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div id="nexus-root" style={{
      width: "100%", height: "100vh", background: T.bg0, color: T.text,
      fontFamily: "'Exo 2', 'Rajdhani', 'Segoe UI', monospace",
      display: "flex", flexDirection: "column", overflow: "hidden",
      position: "relative",
    }}>

      {/* Style block first so styles parse before content; scoped reset via #nexus-root */}
      <style>{`
        @keyframes scroll-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        #nexus-root, #nexus-root * { box-sizing: border-box; margin: 0; padding: 0; }
        #nexus-root ::-webkit-scrollbar { width: 4px; }
        #nexus-root ::-webkit-scrollbar-track { background: ${T.bg0}; }
        #nexus-root ::-webkit-scrollbar-thumb { background: ${T.accentDim}; border-radius: 2px; }
        #nexus-root ::-webkit-scrollbar-thumb:hover { background: ${T.accent}; }
        #nexus-root .nexus-input::placeholder { color: ${T.textMuted}; }
        #nexus-root .nexus-nav-btn:hover { background: rgba(139,92,246,0.08) !important; }
        #nexus-root .nexus-layer-btn:hover { background: rgba(139,92,246,0.08) !important; }
      `}</style>

      {/* ─── TOP BAR ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 16px", background: T.bg1,
        borderBottom: `1px solid ${T.border}`,
        minHeight: 40, zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `radial-gradient(circle at 40% 40%, ${T.accentBright}, ${T.accentDim})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 12px ${T.accentGlow}`,
            fontSize: 13, fontWeight: 800, color: "#fff",
          }}>N</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: T.accentSoft }}>GDLET NEXUS</div>
            <div style={{ fontSize: 8, letterSpacing: 2, color: T.textMuted, marginTop: -1 }}>GLOBAL INTELLIGENCE • COMMAND CENTER</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
            <span style={{ color: T.textDim, letterSpacing: 1 }}>147 FEEDS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.amber, boxShadow: `0 0 6px ${T.amber}` }} />
            <span style={{ color: T.textDim, letterSpacing: 1 }}>3 THREATS</span>
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
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.accentSoft, letterSpacing: 2 }}>{utc} <span style={{ fontSize: 9, color: T.textMuted }}>UTC</span></div>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>{dateStr}</div>
        </div>
      </div>

      {/* ─── MAIN LAYOUT ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* LEFT NAV */}
        <div style={{
          width: 52, background: T.bg1, borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 8, gap: 2,
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

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 12 }}>
            <button type="button" onClick={() => setCopilotOpen(!copilotOpen)} style={{
              width: 36, height: 36, borderRadius: "50%", border: `1px solid ${copilotOpen ? T.accent : T.border}`,
              background: copilotOpen ? T.accentGlow : T.bg2, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
              boxShadow: copilotOpen ? `0 0 12px ${T.accentGlow}` : "none",
            }}>
              <span style={{ fontSize: 16, color: copilotOpen ? T.accentBright : T.textMuted }}>⬡</span>
            </button>
            <span style={{ fontSize: 7, color: T.textMuted, letterSpacing: 0.5, whiteSpace: "nowrap" }}>⌃ Space</span>
          </div>
        </div>

        {/* CENTER CONTENT wrapper gets minHeight: 0 for reliable scroll */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {renderCenter()}
        </div>

        {/* RIGHT PANELS */}
        <div style={{
          width: 300, background: T.bg1, borderLeft: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <Panel title="LIVE INTELLIGENCE FEED" icon="▤" badge={`${NEWS_ITEMS.length}`} style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {["ALL", "BREAKING", "MARKET-MOVING", "ESCALATING"].map(f => (
                <button key={f} type="button" onClick={() => setNewsFilter(f)} style={{
                  padding: "2px 7px", border: `1px solid ${newsFilter === f ? T.accent : T.border}`,
                  borderRadius: 2, fontSize: 8, letterSpacing: 0.5, fontWeight: 600, cursor: "pointer",
                  background: newsFilter === f ? T.accentGlow : "transparent",
                  color: newsFilter === f ? T.accentBright : T.textMuted,
                }}>{f}</button>
              ))}
            </div>
            {filteredNews.map(n => (
              <div key={n.id} style={{
                padding: "7px 8px", marginBottom: 4, borderRadius: 4,
                background: T.accentGlow2, border: `1px solid ${T.border}`,
                cursor: "pointer", transition: "border-color 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.borderActive}
                onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: 1, color: n.color, background: `${n.color}15`, padding: "1px 5px", borderRadius: 2 }}>{n.label}</span>
                  <span style={{ fontSize: 8, color: T.textMuted }}>{n.time}</span>
                </div>
                <div style={{ fontSize: 10, color: T.text, lineHeight: 1.4, fontWeight: 500 }}>{n.title}</div>
                <div style={{ fontSize: 8, color: T.textMuted, marginTop: 3, letterSpacing: 0.5 }}>{n.region}</div>
              </div>
            ))}
          </Panel>

          <Panel title="MARKETS" icon="◈" badge="LIVE" style={{ height: 260, flexShrink: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {MARKETS.map(m => (
                <div key={m.sym} style={{ padding: "4px 6px", background: T.accentGlow2, borderRadius: 3, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: T.accentSoft, letterSpacing: 1 }}>{m.sym}</span>
                    <Sparkline data={sparkData[m.sym]} color={m.up ? T.green : T.red} w={36} h={12} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.text, marginTop: 2 }}>{m.val}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: m.up ? T.green : T.red }}>{m.chg}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, padding: "5px 7px", background: "rgba(248,113,113,0.06)", border: `1px solid rgba(248,113,113,0.15)`, borderRadius: 3 }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.amber, marginBottom: 2 }}>AI INSIGHT</div>
              <div style={{ fontSize: 9, color: T.textDim, lineHeight: 1.4 }}>
                Brent +3.14% correlates with Red Sea vessel diversions. VIX elevated — ECB signaling driving EUR vol. Semiconductor names may gap on TSMC yield news.
              </div>
            </div>
          </Panel>

          <Panel title="TODAY'S AGENDA" icon="☰" style={{ height: 160, flexShrink: 0 }}>
            {AGENDA.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: T.accentSoft, minWidth: 38 }}>{a.time}</span>
                <span style={{ fontSize: 10, color: T.text, flex: 1 }}>{a.title}</span>
                <span style={{
                  fontSize: 7, letterSpacing: 0.5, padding: "1px 5px", borderRadius: 2,
                  background: a.tag === "travel" ? "rgba(248,113,113,0.15)" : T.accentGlow2,
                  color: a.tag === "travel" ? T.amber : T.textMuted, fontWeight: 600, textTransform: "uppercase",
                }}>{a.tag}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      {/* ─── AI COPILOT DRAWER ─────────────────────────────────────── */}
      {copilotOpen && (
        <div style={{
          position: "absolute", bottom: 0, left: 52, right: 0,
          height: 260, background: `linear-gradient(180deg, ${T.bg2}f5, ${T.bg0}fa)`,
          backdropFilter: "blur(16px)",
          borderTop: `1px solid ${T.borderActive}`,
          display: "flex", flexDirection: "column", zIndex: 30,
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 16px", borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: T.accentBright,
                boxShadow: `0 0 8px ${T.accentBright}`, animation: "pulse 2s infinite",
              }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: T.accentSoft }}>NEXUS COPILOT</span>
              <span style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1 }}>— CROSS-DOMAIN INTELLIGENCE SYNTHESIS</span>
            </div>
            <button type="button" onClick={() => setCopilotOpen(false)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 16, cursor: "pointer" }}>×</button>
          </div>

          <div ref={copilotRef} style={{ flex: 1, overflow: "auto", padding: "10px 16px" }}>
            {copilotMessages.map((m, i) => (
              <div key={i} style={{ marginBottom: 8, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "75%", padding: "8px 12px", borderRadius: 6,
                  background: m.role === "user" ? T.accentGlow : T.accentGlow2,
                  border: `1px solid ${m.role === "user" ? T.accent : T.border}`,
                }}>
                  {m.role === "nexus" && (
                    <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, color: T.accentSoft, marginBottom: 3 }}>NEXUS</div>
                  )}
                  <div style={{ fontSize: 10.5, color: T.text, lineHeight: 1.5 }}>{m.text}</div>
                </div>
              </div>
            ))}
            {copilotLoading && (
              <div style={{ marginBottom: 8, display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  maxWidth: "75%", padding: "8px 12px", borderRadius: 6,
                  background: T.accentGlow2, border: `1px solid ${T.border}`,
                }}>
                  <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, color: T.accentSoft, marginBottom: 3 }}>NEXUS</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: T.accentSoft, letterSpacing: 1.5, animation: "pulse 1.5s infinite" }}>PROCESSING</span>
                    {/* FIX #5: dots are <div>s so width/height actually render */}
                    <div style={{ display: "inline-flex", gap: 3 }}>
                      {[0, 1, 2].map(d => (
                        <div key={d} style={{
                          width: 4, height: 4, borderRadius: "50%", background: T.accentSoft,
                          animation: `pulse 1.2s ${d * 0.2}s infinite`,
                          display: "inline-block",
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderTop: `1px solid ${T.border}` }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: copilotLoading ? T.amber : T.accentBright,
              boxShadow: `0 0 4px ${copilotLoading ? T.amber : T.accentBright}`,
            }} />
            <input
              className="nexus-input"
              value={copilotInput}
              onChange={e => setCopilotInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendCopilot()}
              placeholder={copilotLoading ? "NEXUS is processing..." : "Ask NEXUS anything across all intelligence domains..."}
              disabled={copilotLoading}
              style={{
                flex: 1, background: T.accentGlow2, border: `1px solid ${T.border}`,
                borderRadius: 4, padding: "8px 12px", color: T.text, fontSize: 11,
                outline: "none", fontFamily: "'Exo 2', sans-serif",
                opacity: copilotLoading ? 0.5 : 1,
              }}
              onFocus={e => { if (!copilotLoading) e.target.style.borderColor = T.accent; }}
              onBlur={e => e.target.style.borderColor = T.border}
            />
            {/* FIX #4: SEND button inherits the component font family */}
            <button type="button" onClick={sendCopilot} disabled={copilotLoading} style={{
              padding: "6px 16px", background: copilotLoading ? T.accentDim : T.accent,
              border: "none", borderRadius: 4, color: "#fff", fontSize: 10, fontWeight: 700,
              letterSpacing: 1, cursor: copilotLoading ? "not-allowed" : "pointer",
              boxShadow: copilotLoading ? "none" : `0 0 12px ${T.accentGlow}`,
              opacity: copilotLoading ? 0.5 : 1,
              fontFamily: "inherit",
            }}>SEND</button>
          </div>
        </div>
      )}

      {/* ─── BOTTOM TICKER ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", padding: "4px 16px",
        background: T.bg1, borderTop: `1px solid ${T.border}`,
        overflow: "hidden", minHeight: 24,
      }}>
        <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.5, color: T.accentDim, marginRight: 12, flexShrink: 0 }}>TICKER</span>
        <div style={{ overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
          <div style={{ display: "inline-block", animation: "scroll-ticker 45s linear infinite" }}>
            {[...MARKETS, ...MARKETS].map((m, i) => (
              <span key={i} style={{ marginRight: 24, fontSize: 9, letterSpacing: 0.5 }}>
                <span style={{ color: T.accentSoft, fontWeight: 600 }}>{m.sym}</span>
                <span style={{ color: T.textDim, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>{m.val}</span>
                <span style={{ color: m.up ? T.green : T.red, marginLeft: 4, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{m.chg}</span>
              </span>
            ))}
          </div>
        </div>
        <span style={{ fontSize: 7, color: T.textMuted, letterSpacing: 1, flexShrink: 0, marginLeft: 12 }}>NEXUS v0.2.0 • SESSION 03</span>
      </div>
    </div>
  );
}