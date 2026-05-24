import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";

// ─── Theme (mirrors GDLETNexus T object) ─────────────────────────────────────
const T = {
  bg0: "#0e0010", bg1: "#120018", bg2: "#1a0025", bg3: "#220030",
  accent: "#7c3aed", accentBright: "#8b5cf6", accentSoft: "#a78bfa",
  accentDim: "#5b21b6", accentGlow: "rgba(139,92,246,0.15)",
  accentGlow2: "rgba(139,92,246,0.08)",
  text: "#f0e6ff", textDim: "#b8a0d0", textMuted: "#6b5080",
  green: "#34d399", red: "#f87171", amber: "#fbbf24", cyan: "#22d3ee",
  border: "rgba(139,92,246,0.12)", borderActive: "rgba(139,92,246,0.35)",
};

const FLIGHT_COLORS = { MIL: T.red, SURV: T.amber, CARGO: T.cyan, COM: T.accentSoft };

function riskColor(risk) {
  return risk > 80 ? T.red : risk > 60 ? T.amber : T.accentSoft;
}

function parseAltMeters(altStr) {
  if (!altStr) return 10000;
  const ft = parseInt(altStr.replace(/[^0-9]/g, "")) || 0;
  return ft * 0.3048;
}

// Draw a plane-arrow icon on a canvas, pointing "up" (north at heading=0)
function makePlaneCanvas(color) {
  const c = document.createElement("canvas");
  c.width = 24; c.height = 24;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(12, 1);   // nose
  ctx.lineTo(22, 20);  // right wingtip
  ctx.lineTo(12, 16);  // tail centre
  ctx.lineTo(2, 20);   // left wingtip
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  return c;
}
const _planeCache = {};
function getPlaneCanvas(color) {
  if (!_planeCache[color]) _planeCache[color] = makePlaneCanvas(color);
  return _planeCache[color];
}

// One CallbackProperty instance shared between semiMajorAxis and semiMinorAxis
// guarantees equality — same object, same value, no cross-ms drift.
// The `time` argument is the same JulianDate for every callback in one render frame.
function makePulseAxis() {
  return new Cesium.CallbackProperty((time) => {
    const ms = Cesium.JulianDate.toDate(time).getTime();
    return 80_000 + ((ms % 2500) / 2500) * 270_000;
  }, false);
}

// Red Sea ↔ Hormuz, Taiwan ↔ South China Sea
const TENSION_LINES = [
  { from: [43, 13.5],  to: [56.5, 26.5], color: T.red   },
  { from: [119, 24.5], to: [115, 11],    color: T.amber },
];

// ─── Flight detail drawer ─────────────────────────────────────────────────────
function FlightDrawer({ flight, onClose }) {
  const [detail, setDetail] = useState({ state: "loading" });
  const col = FLIGHT_COLORS[flight.type] || T.accentSoft;

  useEffect(() => {
    let cancelled = false;
    setDetail({ state: "loading" });
    const cs = encodeURIComponent(flight.callsign || "");
    fetch(`http://localhost:8000/api/flight/${encodeURIComponent(flight.id)}?callsign=${cs}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDetail({ state: "ok", data: d }); })
      .catch(() => { if (!cancelled) setDetail({ state: "error" }); });
    return () => { cancelled = true; };
  }, [flight.id, flight.callsign]);

  const aircraft = detail.state === "ok" ? detail.data.aircraft : null;
  const route    = detail.state === "ok" ? detail.data.route    : null;

  const Section = ({ label, children }) => (
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
      <div style={{ fontSize: 8, letterSpacing: 1, color: T.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );

  const Row = ({ k, v }) => v ? (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textDim, padding: "2px 0", gap: 12 }}>
      <span style={{ color: T.textMuted, fontWeight: 600, letterSpacing: 0.5, flexShrink: 0 }}>{k}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: T.text, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
    </div>
  ) : null;

  return (
    <div style={{
      position: "absolute", top: 12, right: 12, width: 290, zIndex: 10,
      background: `linear-gradient(135deg, ${T.bg2}ee, ${T.bg1}ee)`,
      backdropFilter: "blur(12px)",
      border: `1px solid ${T.borderActive}`,
      borderRadius: 6, padding: 14, maxHeight: "calc(100vh - 120px)", overflow: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: col, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>{flight.callsign}</div>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginTop: 2, textTransform: "uppercase" }}>{flight.type} · ICAO {flight.id?.toUpperCase()}</div>
        </div>
        <div style={{
          background: `${col}1a`, border: `1px solid ${col}`, padding: "2px 8px", borderRadius: 3,
          fontSize: 10, fontWeight: 700, color: col, fontFamily: "'JetBrains Mono', monospace",
        }}>{flight.type}</div>
      </div>

      <Section label="TELEMETRY">
        <Row k="ALT"     v={flight.alt} />
        <Row k="SPEED"   v={flight.speed} />
        <Row k="HEADING" v={`${Math.round(flight.heading ?? 0)}°`} />
        <Row k="LAT"     v={flight.lat?.toFixed(3)} />
        <Row k="LNG"     v={flight.lng?.toFixed(3)} />
      </Section>

      <Section label="AIRCRAFT">
        {detail.state === "loading" && <div style={{ fontSize: 9, color: T.textMuted, padding: "4px 0" }}>fetching ADSBdb…</div>}
        {detail.state === "error"   && <div style={{ fontSize: 9, color: T.red, padding: "4px 0" }}>lookup failed</div>}
        {detail.state === "ok" && !aircraft && <div style={{ fontSize: 9, color: T.textMuted, padding: "4px 0" }}>no records for this hex</div>}
        {aircraft && (
          <>
            <Row k="MODEL"        v={aircraft.type} />
            <Row k="MANUFACTURER" v={aircraft.manufacturer} />
            <Row k="REGISTRATION" v={aircraft.registration} />
            <Row k="OWNER"        v={aircraft.registered_owner} />
            <Row k="COUNTRY"      v={aircraft.registered_owner_country_name} />
          </>
        )}
      </Section>

      <Section label="ROUTE">
        {detail.state === "loading" && <div style={{ fontSize: 9, color: T.textMuted, padding: "4px 0" }}>fetching route…</div>}
        {detail.state === "ok" && !route && <div style={{ fontSize: 9, color: T.textMuted, padding: "4px 0" }}>no scheduled route (likely unscheduled or military)</div>}
        {route && (
          <>
            {route.airline?.name && <Row k="AIRLINE" v={route.airline.name} />}
            <Row k="FROM" v={route.origin      ? `${route.origin.iata_code || route.origin.icao_code} — ${route.origin.municipality}, ${route.origin.country_iso_name}` : null} />
            <Row k="TO"   v={route.destination ? `${route.destination.iata_code || route.destination.icao_code} — ${route.destination.municipality}, ${route.destination.country_iso_name}` : null} />
          </>
        )}
      </Section>

      <button type="button" onClick={onClose} style={{
        position: "absolute", top: 8, right: 10, background: "none", border: "none",
        color: T.textMuted, fontSize: 16, cursor: "pointer", padding: 2,
      }}>×</button>
    </div>
  );
}

// ─── Hotspot detail drawer ────────────────────────────────────────────────────
function HotspotDrawer({ hotspot, news, onClose }) {
  const col     = hotspot.risk > 80 ? T.red : T.amber;
  const related = (news || []).filter(n => (parseFloat(n.tone) || 0) < -3).slice(0, 3);

  return (
    <div style={{
      position: "absolute", top: 12, right: 12, width: 290, zIndex: 10,
      background: `linear-gradient(135deg, ${T.bg2}ee, ${T.bg1}ee)`,
      backdropFilter: "blur(12px)",
      border: `1px solid ${T.borderActive}`,
      borderRadius: 6, padding: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{hotspot.name}</div>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginTop: 2, textTransform: "uppercase" }}>{hotspot.type}</div>
        </div>
        <div style={{
          background: hotspot.risk > 80 ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.2)",
          border: `1px solid ${col}`, padding: "2px 8px", borderRadius: 3,
          fontSize: 11, fontWeight: 700, color: col, fontFamily: "'JetBrains Mono', monospace",
        }}>{hotspot.risk}</div>
      </div>
      <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.5, marginBottom: 10 }}>
        Active monitoring zone. AI-detected signal convergence across military, economic, and
        logistical domains. {hotspot.risk > 80
          ? "Elevated threat posture — recommend continuous monitoring."
          : "Moderate activity — standard watch protocol."}
      </div>
      {related.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 8, letterSpacing: 1, color: T.textMuted, marginBottom: 6, fontWeight: 600 }}>RELATED SIGNALS</div>
          {related.map((n, i) => (
            <div key={i} style={{ fontSize: 9, color: T.textDim, padding: "3px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.red, fontSize: 7, fontWeight: 700, marginRight: 4 }}>▲</span>
              {n.title?.slice(0, 72)}{n.title?.length > 72 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {["DOSSIER", "WATCHLIST", "ALERT"].map(a => (
          <button key={a} type="button" style={{
            flex: 1, padding: "4px 0", border: `1px solid ${T.border}`, borderRadius: 3,
            background: "transparent", color: T.accentSoft, fontSize: 8, letterSpacing: 1,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>{a}</button>
        ))}
      </div>
      <button type="button" onClick={onClose} style={{
        position: "absolute", top: 8, right: 10, background: "none", border: "none",
        color: T.textMuted, fontSize: 16, cursor: "pointer", padding: 2,
      }}>×</button>
    </div>
  );
}

// ─── CesiumGlobe ─────────────────────────────────────────────────────────────
export function CesiumGlobe({
  flights,
  hotspots,
  news,
  activeLayer,      // "hotspots" | "flights" | "shipping" | ...
  showHotspots,     // false in AIR view
  selectedHotspot,
  onHotspotSelect,
  style,
}) {
  const containerRef = useRef(null);
  const viewerRef    = useRef(null);
  const flightDSRef  = useRef(null);
  const hotspotDSRef = useRef(null);
  const tensionDSRef = useRef(null);
  const [selectedFlight, setSelectedFlight] = useState(null);

  // ── Init viewer once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) Cesium.Ion.defaultAccessToken = token;

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        Cesium.TileMapServiceImageryProvider.fromUrl(
          Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
        )
      ),
      ...(token ? { terrain: Cesium.Terrain.fromWorldTerrain() } : {}),
      animation:                              false,
      baseLayerPicker:                        false,
      fullscreenButton:                       false,
      geocoder:                               false,
      homeButton:                             false,
      infoBox:                                false,
      sceneModePicker:                        false,
      selectionIndicator:                     false,
      timeline:                               false,
      navigationHelpButton:                   false,
      navigationInstructionsInitiallyVisible: false,
    });

    // Dark purple theme
    viewer.scene.backgroundColor                    = Cesium.Color.fromCssColorString(T.bg0);
    viewer.scene.globe.enableLighting               = false;
    viewer.scene.skyBox.show                        = false;
    viewer.scene.sun.show                           = false;
    viewer.scene.moon.show                          = false;
    viewer.scene.skyAtmosphere.hueShift             = 0.58;
    viewer.scene.skyAtmosphere.saturationShift      = 0.40;
    viewer.scene.skyAtmosphere.brightnessShift      = -0.30;
    viewer.scene.globe.atmosphereHueShift           = 0.58;
    viewer.scene.globe.atmosphereSaturationShift    = 0.40;
    viewer.scene.globe.atmosphereBrightnessShift    = -0.20;

    // Hide Cesium credit bar (attribution shown in our own overlay)
    viewer._cesiumWidget._creditContainer.style.display = "none";

    // Initial camera — Atlantic overview
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-20, 20, 20_000_000),
    });

    // Data sources
    const flightDS  = new Cesium.CustomDataSource("flights");
    const hotspotDS = new Cesium.CustomDataSource("hotspots");
    const tensionDS = new Cesium.CustomDataSource("tensions");
    viewer.dataSources.add(flightDS);
    viewer.dataSources.add(hotspotDS);
    viewer.dataSources.add(tensionDS);
    flightDSRef.current  = flightDS;
    hotspotDSRef.current = hotspotDS;
    tensionDSRef.current = tensionDS;

    // Static tension lines
    TENSION_LINES.forEach(({ from, to, color }) => {
      tensionDS.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([...from, ...to]),
          material: new Cesium.PolylineDashMaterialProperty({
            color:      Cesium.Color.fromCssColorString(color).withAlpha(0.25),
            dashLength: 16,
            gapColor:   Cesium.Color.TRANSPARENT,
          }),
          width: 1,
        },
      });
    });

    // Hover tooltip DOM element
    const tooltip = document.createElement("div");
    tooltip.style.cssText = `
      position:absolute; pointer-events:none; z-index:100; display:none;
      background:${T.bg2}ee; border:1px solid ${T.borderActive}; border-radius:4px;
      padding:6px 10px; font-family:'JetBrains Mono',monospace; color:${T.text};
      font-size:10px; backdrop-filter:blur(8px); min-width:130px;
    `;
    containerRef.current.appendChild(tooltip);

    // Click: hotspot or flight selection (mutually exclusive)
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e) => {
      const picked = viewer.scene.pick(e.position);
      if (Cesium.defined(picked) && picked.id?.properties?.isHotspot?.getValue()) {
        onHotspotSelect(picked.id.properties.hotspotData.getValue());
        setSelectedFlight(null);
        return;
      }
      if (Cesium.defined(picked) && picked.id?.properties?.isFlight?.getValue()) {
        setSelectedFlight(picked.id.properties.flightData.getValue());
        onHotspotSelect(null);
        return;
      }
      onHotspotSelect(null);
      setSelectedFlight(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Hover: flight tooltip
    handler.setInputAction((e) => {
      const picked = viewer.scene.pick(e.endPosition);
      if (Cesium.defined(picked) && picked.id?.properties?.isFlight?.getValue()) {
        const f   = picked.id.properties.flightData.getValue();
        const col = FLIGHT_COLORS[f.type] || T.textDim;
        tooltip.innerHTML = `
          <div style="color:${col};font-weight:700;letter-spacing:1px;margin-bottom:3px">${f.callsign}</div>
          <div style="color:${T.textDim};font-size:9px">${f.type} · ${f.alt} · ${f.speed}</div>
          <div style="color:${T.textMuted};font-size:8px">Origin: ${f.origin}</div>
        `;
        tooltip.style.display = "block";
        tooltip.style.left    = `${e.endPosition.x + 14}px`;
        tooltip.style.top     = `${e.endPosition.y - 10}px`;
      } else {
        tooltip.style.display = "none";
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    viewerRef.current = viewer;

    return () => {
      handler.destroy();
      tooltip.remove();
      viewer.destroy();
      viewerRef.current    = null;
      flightDSRef.current  = null;
      hotspotDSRef.current = null;
      tensionDSRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flight entities ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ds     = flightDSRef.current;
    const viewer = viewerRef.current;
    if (!ds || !viewer) return;

    ds.entities.removeAll();

    const prio    = (flights || []).filter(f => f.type !== "COM").slice(0, 40);
    const com     = (flights || []).filter(f => f.type === "COM").slice(0, 60);
    const visible = [...prio, ...com];

    visible.forEach(f => {
      const altM   = parseAltMeters(f.alt);
      const color  = FLIGHT_COLORS[f.type] || T.accentSoft;
      const canvas = getPlaneCanvas(color);

      const entity = ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(f.lng, f.lat, altM),
        billboard: {
          image:                    canvas,
          rotation:                 Cesium.Math.toRadians(-(f.heading ?? 0)),
          alignedAxis:              Cesium.Cartesian3.ZERO,
          scale:                    0.75,
          verticalOrigin:           Cesium.VerticalOrigin.CENTER,
          horizontalOrigin:         Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entity.properties = new Cesium.PropertyBag({
        isFlight:   true,
        flightData: f,
      });
    });

    viewer.scene.requestRender();
  }, [flights]);

  // ── Hotspot entities (redrawn when hotspots change — static data, once) ─────
  useEffect(() => {
    const ds     = hotspotDSRef.current;
    const viewer = viewerRef.current;
    if (!ds || !viewer) return;

    ds.entities.removeAll();

    (hotspots || []).forEach(h => {
      const col          = riskColor(h.risk);
      const cesiumColor  = Cesium.Color.fromCssColorString(col);
      const sz           = h.risk > 80 ? 7 : 5;

      // Pulsing outer ring — one shared CallbackProperty for both axes
      const pulseAxis = makePulseAxis();
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(h.lng, h.lat, 0),
        ellipse: {
          semiMajorAxis: pulseAxis,
          semiMinorAxis: pulseAxis,
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty((time) => {
              const ms = Cesium.JulianDate.toDate(time).getTime();
              const phase = (ms % 2500) / 2500;
              return cesiumColor.withAlpha(0.28 * (1 - phase));
            }, false)
          ),
          outline:         false,
          height:          0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      // Clickable centre point + label
      const pt = ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(h.lng, h.lat, 0),
        point: {
          pixelSize:                sz,
          color:                    cesiumColor,
          outlineColor:             Cesium.Color.WHITE.withAlpha(0.55),
          outlineWidth:             1,
          heightReference:          Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text:                     h.name,
          font:                     "600 9px 'JetBrains Mono', monospace",
          fillColor:                Cesium.Color.fromCssColorString(T.textDim),
          outlineColor:             Cesium.Color.fromCssColorString(T.bg0),
          outlineWidth:             2,
          style:                    Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset:              new Cesium.Cartesian2(0, -18),
          heightReference:          Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale:                    0.9,
        },
      });
      pt.properties = new Cesium.PropertyBag({
        isHotspot:   true,
        hotspotData: h,
      });
    });

    viewer.scene.requestRender();
  }, [hotspots]);

  // ── Layer / mode visibility ─────────────────────────────────────────────────
  useEffect(() => {
    const fd = flightDSRef.current;
    const hd = hotspotDSRef.current;
    const td = tensionDSRef.current;
    if (!fd || !hd) return;

    // AIR view: flights only, no hotspots/tensions
    fd.show = true;
    hd.show = showHotspots;
    if (td) td.show = showHotspots;

    viewerRef.current?.scene.requestRender();
  }, [activeLayer, showHotspots]);

  // ── Camera reset ────────────────────────────────────────────────────────────
  function resetCamera() {
    viewerRef.current?.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-20, 20, 20_000_000),
      duration:    1.5,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", ...style }}>
      {/* Cesium viewport */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Hotspot detail drawer */}
      {selectedHotspot && showHotspots && !selectedFlight && (
        <HotspotDrawer
          hotspot={selectedHotspot}
          news={news || []}
          onClose={() => onHotspotSelect(null)}
        />
      )}

      {/* Flight detail drawer */}
      {selectedFlight && (
        <FlightDrawer
          flight={selectedFlight}
          onClose={() => setSelectedFlight(null)}
        />
      )}

      {/* Camera reset */}
      <button type="button" onClick={resetCamera} title="Reset globe view"
        style={{
          position: "absolute", bottom: showHotspots ? 56 : 12, right: 12, zIndex: 5,
          background: `${T.bg2}cc`, border: `1px solid ${T.border}`,
          borderRadius: 4, padding: "4px 10px", color: T.accentSoft,
          fontSize: 9, letterSpacing: 1, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit", backdropFilter: "blur(4px)",
        }}>
        ⟳ RESET
      </button>

      {/* Attribution (replaces hidden Cesium credit bar) */}
      <div style={{
        position: "absolute", bottom: 4, left: 8, zIndex: 5,
        fontSize: 7, color: T.textMuted, letterSpacing: 0.5,
        pointerEvents: "none",
      }}>
        © Cesium · Natural Earth · OpenSky · ADS-B Exchange
      </div>

      {/* Unimplemented layer overlay */}
      {showHotspots && ["shipping", "weather", "sanctions", "infra"].includes(activeLayer) && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", zIndex: 6,
          transform: "translate(-50%, -50%)",
          background: `${T.bg2}cc`, border: `1px solid ${T.border}`,
          borderRadius: 6, padding: "10px 20px", textAlign: "center",
          pointerEvents: "none", backdropFilter: "blur(4px)",
        }}>
          <div style={{ fontSize: 10, color: T.accentSoft, letterSpacing: 2, fontWeight: 700 }}>
            {activeLayer.toUpperCase()} LAYER
          </div>
          <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4, letterSpacing: 1 }}>
            DATA INTEGRATION — SESSION 05
          </div>
        </div>
      )}

      {/* Bottom telemetry strip (CMD view only) */}
      {showHotspots && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5,
          background: `linear-gradient(transparent, ${T.bg0}e0)`,
          padding: "20px 16px 8px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          pointerEvents: "none",
        }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {(hotspots || []).slice(0, 4).map(h => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: riskColor(h.risk), boxShadow: `0 0 4px ${riskColor(h.risk)}`,
                }} />
                <span style={{ fontSize: 9, color: T.textDim }}>{h.name}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace", color: riskColor(h.risk),
                }}>{h.risk}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1 }}>
            CESIUM 3D · ADS-B: OPENSKY + ADS-B EXCHANGE · REFRESH: 15s
          </div>
        </div>
      )}
    </div>
  );
}
