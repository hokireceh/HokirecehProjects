import React, { useState, useEffect, useCallback, useRef } from "react";
import { Star, Search, TrendingUp, TrendingDown, BarChart2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MarketRow {
  index: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  type: "perp" | "spot";
  lastPrice: number;
  priceChange24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  priceDecimals: number;
  listedAt: string | null;
  openInterest: number | null;
  maxLeverage: number | null;
  sparkline: number[];
}

interface AllMarketsResponse {
  markets: MarketRow[];
  stats: {
    totalMarkets: number;
    totalVolume24h: number;
    totalOpenInterest: number;
    perpCount: number;
    spotCount: number;
  };
  recentlyListed: MarketRow[];
  gainers: MarketRow[];
  losers: MarketRow[];
}

type SortKey = "symbol" | "volume24h" | "lastPrice" | "priceChange24h" | "openInterest" | "listedAt";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SYMBOL_COLORS: Record<string, string> = {
  BTC: "#f97316", ETH: "#627eea", BNB: "#f0b90b", SOL: "#9945ff",
  HYPE: "#00d4aa", SUI: "#4da2ff", TON: "#0088cc", MNT: "#00b4d8",
  ZEC: "#ecb244", XAUT: "#d4af37", PAXG: "#c9b037", NEAR: "#00c1de",
  XPL: "#7c3aed", ONT: "#00a4ff", GIGA: "#ff6b35",
};

function getSymbolColor(symbol: string): string {
  return SYMBOL_COLORS[symbol] ?? `hsl(${(symbol.charCodeAt(0) * 47) % 360}, 70%, 55%)`;
}

function CoinIcon({ symbol, size = 24 }: { symbol: string; size?: number }) {
  const color = getSymbolColor(symbol);
  const label = symbol.slice(0, 4);
  const fontSize = size <= 20 ? 6 : size <= 28 ? 8 : 10;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <circle cx="16" cy="16" r="16" fill={color} />
      <text x="16" y="16" dominantBaseline="central" textAnchor="middle"
        fill="white" fontSize={fontSize} fontWeight="700" fontFamily="system-ui">
        {label}
      </text>
    </svg>
  );
}

function Sparkline({ prices, positive }: { prices: number[]; positive: boolean }) {
  if (prices.length < 2) {
    return <div style={{ width: 80, height: 32, borderRadius: 4, background: "rgba(255,255,255,0.05)" }} />;
  }
  const W = 80, H = 32, PAD = 2;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = PAD + (i / (prices.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (p - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color = positive ? "#22c55e" : "#ef4444";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function formatVolume(v: number): string {
  if (!v || v === 0) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function formatPrice(price: number, decimals: number): string {
  if (!price) return "—";
  return price.toLocaleString("en-US", { minimumFractionDigits: Math.min(decimals, 6), maximumFractionDigits: Math.min(decimals, 6) });
}

function PctChange({ value }: { value: number }) {
  if (value === undefined || value === null) return <span className="text-muted-foreground">—</span>;
  const pos = value >= 0;
  return (
    <span style={{ color: pos ? "#22c55e" : "#ef4444", fontFamily: "monospace", fontWeight: 600 }}>
      {pos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function formatListedAt(listedAt: string | null): string {
  if (!listedAt) return "";
  try {
    return new Date(listedAt).toLocaleString("sv-SE", { timeZone: "UTC" }).replace("T", " ");
  } catch { return ""; }
}

function age(listedAt: string | null): string {
  if (!listedAt) return "—";
  try {
    const diff = Date.now() - new Date(listedAt).getTime();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    if (d > 0) return `${d}d ${h}h`;
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  } catch { return "—"; }
}

// ─── Ticker Bar ───────────────────────────────────────────────────────────────
function TickerBar({ markets }: { markets: MarketRow[] }) {
  const items = [...markets, ...markets];
  return (
    <div style={{ background: "#0a0a0f", borderBottom: "1px solid #1e1e2e", overflow: "hidden", height: 36, display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track { display: flex; animation: ticker-scroll ${Math.max(20, markets.length * 3)}s linear infinite; white-space: nowrap; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-track">
        {items.map((m, i) => (
          <span key={i} style={{ padding: "0 20px", fontSize: 12, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>{m.baseAsset}</span>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>${formatPrice(m.lastPrice, m.priceDecimals)}</span>
            <span style={{ color: m.priceChange24h >= 0 ? "#22c55e" : "#ef4444", fontSize: 11 }}>
              {m.priceChange24h >= 0 ? "▲" : "▼"} {Math.abs(m.priceChange24h).toFixed(2)}%
            </span>
            <span style={{ color: "#2a2a3e", marginLeft: 4 }}>|</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Recently Listed Panel ────────────────────────────────────────────────────
function RecentlyListedPanel({ items }: { items: MarketRow[] }) {
  return (
    <div style={{ background: "#0f0f1a", border: "1px solid #1e1e2e", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🆕</span>
        <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 13 }}>Baru Terdaftar</span>
        <TrendingDown size={14} style={{ color: "#94a3b8", marginLeft: "auto" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "6px 12px", fontSize: 12 }}>
        <span style={{ color: "#64748b", fontWeight: 600, paddingBottom: 4, borderBottom: "1px solid #1e1e2e" }}>Aset</span>
        <span style={{ color: "#64748b", fontWeight: 600, textAlign: "right", paddingBottom: 4, borderBottom: "1px solid #1e1e2e" }}>Harga</span>
        <span style={{ color: "#64748b", fontWeight: 600, textAlign: "right", paddingBottom: 4, borderBottom: "1px solid #1e1e2e" }}>Umur</span>
        {items.map((m) => (
          <React.Fragment key={m.index}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 5 }}>
              <CoinIcon symbol={m.baseAsset} size={18} />
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{m.baseAsset}</span>
              {m.type === "perp" && m.maxLeverage && (
                <span style={{ fontSize: 9, background: "#2d1515", color: "#ff6b6b", border: "1px solid #5c2020", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>{m.maxLeverage}X</span>
              )}
            </span>
            <span style={{ fontFamily: "monospace", color: "#e2e8f0", textAlign: "right", paddingTop: 5 }}>
              ${formatPrice(m.lastPrice, m.priceDecimals)}
            </span>
            <span style={{ color: "#64748b", textAlign: "right", paddingTop: 5 }}>{age(m.listedAt)}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Biggest Movers Panel ─────────────────────────────────────────────────────
function BiggestMoversPanel({ gainers, losers }: { gainers: MarketRow[]; losers: MarketRow[] }) {
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");
  const items = tab === "gainers" ? gainers : losers;
  return (
    <div style={{ background: "#0f0f1a", border: "1px solid #1e1e2e", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>📈</span>
        <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 13 }}>Pergerakan Terbesar</span>
        <TrendingUp size={14} style={{ color: "#94a3b8", marginLeft: "auto" }} />
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {(["gainers", "losers"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontSize: 11, padding: "2px 10px", borderRadius: 4, fontWeight: 600, cursor: "pointer", border: "1px solid",
              background: tab === t ? (t === "gainers" ? "#14532d" : "#450a0a") : "transparent",
              color: tab === t ? (t === "gainers" ? "#22c55e" : "#ef4444") : "#64748b",
              borderColor: tab === t ? (t === "gainers" ? "#166534" : "#7f1d1d") : "#1e1e2e",
            }}>
              {t === "gainers" ? "Naik" : "Turun"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((m) => (
          <div key={m.index} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CoinIcon symbol={m.baseAsset} size={22} />
            <span style={{ flex: 1, color: "#e2e8f0", fontWeight: 600, fontSize: 12 }}>{m.baseAsset}</span>
            {m.type === "perp" && m.maxLeverage && (
              <span style={{ fontSize: 9, background: "#2d1515", color: "#ff6b6b", border: "1px solid #5c2020", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>{m.maxLeverage}X</span>
            )}
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#e2e8f0" }}>${formatPrice(m.lastPrice, m.priceDecimals)}</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, minWidth: 60, textAlign: "right", color: m.priceChange24h >= 0 ? "#22c55e" : "#ef4444" }}>
              {m.priceChange24h >= 0 ? "▲" : "▼"} {Math.abs(m.priceChange24h).toFixed(2)}%
            </span>
          </div>
        ))}
        {items.length === 0 && <span style={{ color: "#64748b", fontSize: 12 }}>Tidak ada data</span>}
      </div>
    </div>
  );
}

// ─── Sort Icon ────────────────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} style={{ color: "#475569", marginLeft: 2 }} />;
  return sortDir === "asc"
    ? <ChevronUp size={12} style={{ color: "#94a3b8", marginLeft: 2 }} />
    : <ChevronDown size={12} style={{ color: "#94a3b8", marginLeft: 2 }} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Markets() {
  const [data, setData] = useState<AllMarketsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mkt_favs") ?? "[]")); } catch { return new Set(); }
  });
  const [showOnlyFavs, setShowOnlyFavs] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market/all");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json() as AllMarketsResponse;
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load market data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const toggleFav = useCallback((idx: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      localStorage.setItem("mkt_favs", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <header>
          <div className="h-9 w-48 bg-primary/10 animate-pulse rounded-lg" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded mt-2" />
        </header>
        <div className="h-10 w-full bg-muted/50 animate-pulse rounded-xl" />
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="h-11 bg-muted/30 animate-pulse" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-border/30">
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              <div className="h-6 w-24 bg-muted/50 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, flexDirection: "column", gap: 12 }}>
        <BarChart2 size={48} style={{ color: "#ef4444", opacity: 0.5 }} />
        <span style={{ color: "#ef4444", fontSize: 14 }}>{error}</span>
        <button onClick={fetchData} style={{ padding: "8px 20px", borderRadius: 6, background: "#6366f1", color: "white", border: "none", cursor: "pointer", fontSize: 13 }}>Coba Lagi</button>
      </div>
    );
  }

  const markets = data?.markets ?? [];
  const stats = data?.stats;

  let filtered = markets.filter((m) =>
    (!showOnlyFavs || favorites.has(m.index)) &&
    (m.symbol.toLowerCase().includes(search.toLowerCase()) || m.baseAsset.toLowerCase().includes(search.toLowerCase()))
  );

  filtered = [...filtered].sort((a, b) => {
    let va: number | string | null, vb: number | string | null;
    if (sortKey === "symbol") { va = a.symbol; vb = b.symbol; }
    else if (sortKey === "volume24h") { va = a.volume24h; vb = b.volume24h; }
    else if (sortKey === "lastPrice") { va = a.lastPrice; vb = b.lastPrice; }
    else if (sortKey === "priceChange24h") { va = a.priceChange24h; vb = b.priceChange24h; }
    else if (sortKey === "openInterest") { va = a.openInterest ?? -1; vb = b.openInterest ?? -1; }
    else { va = a.listedAt ?? ""; vb = b.listedAt ?? ""; }

    if (typeof va === "string" && typeof vb === "string") {
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const favs = filtered.filter((m) => favorites.has(m.index));
  const others = filtered.filter((m) => !favorites.has(m.index));
  const sorted = [...favs, ...others];

  const th: React.CSSProperties = {
    padding: "8px 10px", color: "#64748b", fontSize: 11, fontWeight: 600,
    textAlign: "left", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
    borderBottom: "1px solid #1e1e2e",
  };
  const td: React.CSSProperties = {
    padding: "8px 10px", fontSize: 12, borderBottom: "1px solid #0f0f1a",
    verticalAlign: "middle",
  };

  const thBtn = (key: SortKey, label: string, right = false) => (
    <th style={{ ...th, textAlign: right ? "right" : "left" }} onClick={() => handleSort(key)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        {label}
        <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e2e8f0" }}>

      {/* Ticker Bar */}
      {markets.length > 0 && <TickerBar markets={markets} />}

      <div style={{ padding: "20px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Pasar</h1>
          <p style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Data pasar langsung dari DEX Lighter.xyz</p>
        </div>

        {/* Stats Row */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total Pasar", value: stats.totalMarkets.toString(), sub: `${stats.perpCount} Perp · ${stats.spotCount} Spot` },
              { label: "Volume Trading 24j", value: formatVolume(stats.totalVolume24h), sub: "Semua pasangan" },
              { label: "Open Interest", value: stats.totalOpenInterest > 0 ? formatVolume(stats.totalOpenInterest) : "—", sub: "Perpetual" },
              { label: "Pasar Perp", value: stats.perpCount.toString(), sub: "Maks leverage 50×" },
            ].map((s) => (
              <div key={s.label} style={{ background: "#0f0f1a", border: "1px solid #1e1e2e", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", fontFamily: "monospace" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Recently Listed + Biggest Movers */}
        {(data?.recentlyListed?.length ?? 0) > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <RecentlyListedPanel items={data!.recentlyListed} />
            <BiggestMoversPanel gainers={data!.gainers} losers={data!.losers} />
          </div>
        )}

        {/* Search & Filter Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau simbol..."
              style={{
                width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                background: "#0f0f1a", border: "1px solid #1e1e2e", borderRadius: 6,
                color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <button
            onClick={() => setShowOnlyFavs((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
              background: showOnlyFavs ? "#1c1c00" : "#0f0f1a", border: `1px solid ${showOnlyFavs ? "#854d0e" : "#1e1e2e"}`,
              borderRadius: 6, color: showOnlyFavs ? "#fbbf24" : "#64748b", cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            <Star size={13} fill={showOnlyFavs ? "#fbbf24" : "none"} stroke={showOnlyFavs ? "#fbbf24" : "#64748b"} />
            Favorit
          </button>
          <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>{sorted.length} pasar</span>
        </div>

        {/* Market Table */}
        <div style={{ background: "#0f0f1a", border: "1px solid #1e1e2e", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 32, paddingLeft: 12 }}>⭐</th>
                {thBtn("symbol", "Aset ↕")}
                {thBtn("volume24h", "Volume 24j", true)}
                {thBtn("lastPrice", "Harga", true)}
                {thBtn("priceChange24h", "Perubahan 24j", true)}
                {thBtn("openInterest", "Open Interest", true)}
                {thBtn("listedAt", "Terdaftar", true)}
                <th style={{ ...th, textAlign: "right" }}>7 Hari Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, rowIdx) => {
                const isFav = favorites.has(m.index);
                const pos = m.priceChange24h >= 0;
                const sparkPos = m.sparkline.length >= 2
                  ? m.sparkline[m.sparkline.length - 1] >= m.sparkline[0]
                  : pos;
                return (
                  <tr
                    key={m.index}
                    style={{
                      background: rowIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#13131f")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = rowIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)")}
                  >
                    {/* Star */}
                    <td style={{ ...td, paddingLeft: 12, width: 32 }}>
                      <button onClick={() => toggleFav(m.index)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}>
                        <Star size={14} fill={isFav ? "#fbbf24" : "none"} stroke={isFav ? "#fbbf24" : "#475569"} />
                      </button>
                    </td>

                    {/* Asset */}
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CoinIcon symbol={m.baseAsset} size={28} />
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 13 }}>{m.baseAsset}</span>
                            {m.type === "perp" && m.maxLeverage && (
                              <span style={{ fontSize: 9, background: "#2d1515", color: "#ff6b6b", border: "1px solid #5c2020", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>{m.maxLeverage}X</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{m.symbol}</div>
                        </div>
                      </div>
                    </td>

                    {/* 24h Volume */}
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#cbd5e1" }}>
                      {formatVolume(m.volume24h)}
                    </td>

                    {/* Price */}
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#f1f5f9" }}>
                      ${formatPrice(m.lastPrice, m.priceDecimals)}
                    </td>

                    {/* 24h Change */}
                    <td style={{ ...td, textAlign: "right" }}>
                      <PctChange value={m.priceChange24h} />
                    </td>

                    {/* Open Interest */}
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#94a3b8" }}>
                      {m.openInterest ? formatVolume(m.openInterest) : "—"}
                    </td>

                    {/* Listed At */}
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>
                      {formatListedAt(m.listedAt)}
                    </td>

                    {/* Sparkline */}
                    <td style={{ ...td, textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Sparkline prices={m.sparkline} positive={sparkPos} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...td, textAlign: "center", padding: "40px 0", color: "#475569" }}>
                    No markets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 10, color: "#334155", textAlign: "center" }}>
          Data from Lighter.xyz · Refreshes every 60s · Sparklines cached 30min
        </div>
      </div>
    </div>
  );
}
