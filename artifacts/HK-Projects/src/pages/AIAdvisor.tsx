import { useState, useEffect } from "react";
import { useGetOrderBooks } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertTriangle,
  Shield,
  Target,
  Bot,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { Link } from "wouter";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";

type StrategyType = "dca" | "grid";
type DexType = "lighter" | "extended" | "ethereal";
type MarketCondition = "bullish" | "bearish" | "sideways" | "volatile";
type RiskLevel = "low" | "medium" | "high";

interface AIResult {
  strategy: StrategyType;
  dca_params: {
    amountPerOrder: number;
    intervalMinutes: number;
    side: "buy" | "sell";
    orderType: string;
    limitPriceOffset: number;
  } | null;
  grid_params: {
    lowerPrice: number;
    upperPrice: number;
    gridLevels: number;
    amountPerGrid: number;
    mode: string;
    orderType: string;
    limitPriceOffset: number;
    stopLoss: number | null;
    takeProfit: number | null;
  } | null;
  reasoning: string;
  marketCondition: MarketCondition;
  riskLevel: RiskLevel;
  volumeContext: "low" | "normal" | "high";
  confidence: number;
  availableBalance?: number;
  modelUsed: string;
  modelTier: string;
}

const conditionConfig: Record<MarketCondition, { label: string; color: string; Icon: typeof TrendingUp }> = {
  bullish: { label: "Bullish", color: "text-success", Icon: TrendingUp },
  bearish: { label: "Bearish", color: "text-destructive", Icon: TrendingDown },
  sideways: { label: "Sideways", color: "text-blue-400", Icon: Minus },
  volatile: { label: "Volatile", color: "text-warning", Icon: Zap },
};

const riskConfig: Record<RiskLevel, { label: string; color: string; Icon: typeof Shield }> = {
  low: { label: "Risiko Rendah", color: "text-success", Icon: Shield },
  medium: { label: "Risiko Sedang", color: "text-warning", Icon: AlertTriangle },
  high: { label: "Risiko Tinggi", color: "text-destructive", Icon: Target },
};

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-success" : value >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Keyakinan</span>
        <span className="font-mono font-bold text-foreground">{value}%</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}

// ── DEX Selector ──────────────────────────────────────────────────────────────

function DexSelector({ selected, onChange }: { selected: DexType; onChange: (d: DexType) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">DEX</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange("lighter")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-150 flex-1 justify-center ${
            selected === "lighter"
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
              : "bg-background border-border text-muted-foreground hover:border-emerald-500/30 hover:text-foreground"
          }`}
        >
          <ExchangeLogo exchange="lighter" size={14} />
          Lighter
        </button>
        <button
          type="button"
          onClick={() => onChange("extended")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-150 flex-1 justify-center ${
            selected === "extended"
              ? "bg-violet-500/15 border-violet-500/40 text-violet-400"
              : "bg-background border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground"
          }`}
        >
          <ExchangeLogo exchange="extended" size={14} />
          Extended
        </button>
        <button
          type="button"
          onClick={() => onChange("ethereal")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-150 flex-1 justify-center ${
            selected === "ethereal"
              ? "bg-purple-500/15 border-purple-500/40 text-purple-400"
              : "bg-background border-border text-muted-foreground hover:border-purple-500/30 hover:text-foreground"
          }`}
        >
          <ExchangeLogo exchange="ethereal" size={14} />
          Ethereal
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIAdvisor() {
  const { data: marketsData } = useGetOrderBooks();
  const lighterMarkets = marketsData?.markets ?? [];

  const [extendedMarkets, setExtendedMarkets] = useState<{ symbol: string; baseAsset: string }[]>([]);
  const [extMarketsLoading, setExtMarketsLoading] = useState(false);
  const [etherealMarkets, setEtherealMarkets] = useState<{ id: string; ticker: string; displayTicker: string }[]>([]);
  const [ethMarketsLoading, setEthMarketsLoading] = useState(false);

  useEffect(() => {
    setExtMarketsLoading(true);
    fetch("/api/extended/strategies/markets", { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setExtendedMarkets(data.markets ?? []))
      .catch(() => setExtendedMarkets([]))
      .finally(() => setExtMarketsLoading(false));

    setEthMarketsLoading(true);
    fetch("/api/ethereal/strategies/markets", { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setEtherealMarkets(data ?? []))
      .catch(() => setEtherealMarkets([]))
      .finally(() => setEthMarketsLoading(false));
  }, []);

  const [selectedDex, setSelectedDex] = useState<DexType>("lighter");
  const [selectedLighterIndex, setSelectedLighterIndex] = useState<string>("");
  const [selectedExtSymbol, setSelectedExtSymbol] = useState<string>("");
  const [selectedEthTicker, setSelectedEthTicker] = useState<string>("");
  const [strategyType, setStrategyType] = useState<StrategyType>("grid");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Apakah market sudah dipilih (untuk semua DEX)
  const hasMarketSelected = selectedDex === "lighter" ? !!selectedLighterIndex
    : selectedDex === "extended" ? !!selectedExtSymbol
    : !!selectedEthTicker;

  const handleDexChange = (dex: DexType) => {
    setSelectedDex(dex);
    setResult(null);
    setError(null);
    setSelectedLighterIndex("");
    setSelectedExtSymbol("");
    setSelectedEthTicker("");
  };

  const handleAnalyze = async () => {
    if (!hasMarketSelected) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const body = selectedDex === "lighter"
        ? { strategyType, marketIndex: Number(selectedLighterIndex) }
        : selectedDex === "extended"
        ? { strategyType, marketSymbol: selectedExtSymbol }
        : { strategyType, marketSymbol: selectedEthTicker };

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 503) {
          throw new Error("GROQ_API_KEY belum dikonfigurasi. Tambahkan di environment variables server.");
        }
        throw new Error(data.error ?? "Analisis AI gagal");
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message ?? "Terjadi kesalahan");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const cond = result ? conditionConfig[result.marketCondition] : null;
  const risk = result ? riskConfig[result.riskLevel] : null;

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
          <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          AI Advisor
        </h1>
        <p className="text-muted-foreground mt-1">Rekomendasi parameter strategi berbasis analisis pasar real-time</p>
      </header>

      {/* Input Card */}
      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Pilih DEX, Pasar & Strategi
          </CardTitle>
          <CardDescription>AI akan menganalisis kondisi pasar saat ini dan memberikan parameter optimal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── DEX Selector ── */}
          <DexSelector selected={selectedDex} onChange={handleDexChange} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ── Market Selector (dinamis per DEX) ── */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Market</label>

              {selectedDex === "lighter" ? (
                <Select value={selectedLighterIndex} onValueChange={(v) => { setSelectedLighterIndex(v); setResult(null); }}>
                  <SelectTrigger className="bg-background border-border/60">
                    <SelectValue placeholder={lighterMarkets.length === 0 ? "Memuat pasar..." : "Pilih market Lighter..."} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {lighterMarkets.map(m => (
                      <SelectItem key={m.index} value={String(m.index)}>
                        <span className="font-mono">{m.symbol}</span>
                        <span className="ml-2 text-xs text-muted-foreground uppercase">{m.type}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : selectedDex === "extended" ? (
                <Select value={selectedExtSymbol} onValueChange={(v) => { setSelectedExtSymbol(v); setResult(null); }}>
                  <SelectTrigger className="bg-background border-border/60">
                    <SelectValue placeholder={extMarketsLoading ? "Memuat pasar..." : extendedMarkets.length === 0 ? "Tidak ada market" : "Pilih market Extended..."} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {extendedMarkets.map(m => (
                      <SelectItem key={m.symbol} value={m.symbol}>
                        <span className="font-mono">{m.symbol}</span>
                        {m.baseAsset && (
                          <span className="ml-2 text-xs text-muted-foreground">{m.baseAsset}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={selectedEthTicker} onValueChange={(v) => { setSelectedEthTicker(v); setResult(null); }}>
                  <SelectTrigger className="bg-background border-border/60">
                    <SelectValue placeholder={ethMarketsLoading ? "Memuat pasar..." : etherealMarkets.length === 0 ? "Tidak ada market" : "Pilih market Ethereal..."} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {etherealMarkets.map(m => (
                      <SelectItem key={m.id} value={m.ticker}>
                        <span className="font-mono">{m.displayTicker || m.ticker}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* ── Tipe Strategi ── */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Tipe Strategi</label>
              <Select value={strategyType} onValueChange={(v) => setStrategyType(v as StrategyType)}>
                <SelectTrigger className="bg-background border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid Trading — Pasar ranging/sideways</SelectItem>
                  <SelectItem value="dca">DCA (Dollar Cost Avg) — Pasar trending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={!hasMarketSelected || isAnalyzing}
            className="w-full sm:w-auto gap-2"
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Menganalisis...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analisis Sekarang
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Hint — tampil hanya sebelum ada hasil atau error */}
      {!result && !isAnalyzing && !error && (
        <Card className="glass-panel border-border/50 border-dashed">
          <CardContent className="pt-5 pb-5">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="rounded-lg bg-primary/10 p-3 shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-foreground">Apa yang dilakukan AI Advisor?</p>
                <ul className="space-y-1 text-muted-foreground list-none">
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-primary" /> Menganalisis kondisi harga pasar real-time dari Lighter atau Extended DEX</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-primary" /> Menentukan kondisi pasar: Bullish, Bearish, Sideways, atau Volatile</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-primary" /> Memberikan parameter strategi Grid atau DCA yang optimal beserta alasannya</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-primary" /> Rekomendasi dapat langsung dijadikan dasar membuat strategi baru</li>
                </ul>
                <p className="text-xs text-muted-foreground/70 pt-1">
                  ⚡ Pilih DEX, market, dan tipe strategi di atas, lalu klik <span className="font-semibold text-foreground">Analisis Sekarang</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-start gap-3 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Skeleton while analyzing */}
      {isAnalyzing && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="glass-panel border-border/50">
                <CardContent className="pt-6 space-y-3">
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-7 w-28 bg-primary/10 animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="glass-panel border-border/50">
            <CardContent className="pt-6 space-y-3">
              <div className="h-4 w-full bg-muted animate-pulse rounded" />
              <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4/6 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results */}
      {result && cond && risk && !isAnalyzing && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Summary strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="glass-panel border-border/50">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Kondisi Pasar</p>
                <div className={`flex items-center gap-2 font-semibold text-lg ${cond.color}`}>
                  <cond.Icon className="w-5 h-5" />
                  {cond.label}
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-border/50">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Tingkat Risiko</p>
                <div className={`flex items-center gap-2 font-semibold text-lg ${risk.color}`}>
                  <risk.Icon className="w-5 h-5" />
                  {risk.label}
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-border/50">
              <CardContent className="pt-5 pb-4 space-y-2">
                <ConfidenceBar value={result.confidence} />
              </CardContent>
            </Card>
          </div>

          {/* Reasoning */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Analisis AI
                <Badge variant="outline" className="ml-auto text-xs font-mono">{result.modelTier}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground leading-relaxed">{result.reasoning}</p>
              {result.availableBalance !== undefined && (
                <p className="text-xs text-muted-foreground mt-3">
                  Balance yang digunakan untuk kalkulasi: <span className="font-mono font-semibold">${result.availableBalance.toFixed(2)} USDC</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Parameters */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Target className="w-4 h-4" />
                Parameter yang Direkomendasikan
                <Badge className="ml-auto capitalize">{result.strategy === "dca" ? "DCA" : "Grid"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.dca_params && (
                <div>
                  <ParamRow label="Amount per Order" value={`$${result.dca_params.amountPerOrder.toFixed(2)} USDC`} />
                  <ParamRow label="Interval" value={
                    result.dca_params.intervalMinutes >= 60
                      ? `${(result.dca_params.intervalMinutes / 60).toFixed(0)} jam`
                      : `${result.dca_params.intervalMinutes} menit`
                  } />
                  <ParamRow label="Sisi" value={result.dca_params.side === "buy" ? "Buy (Long)" : "Sell (Short)"} />
                  <ParamRow label="Order Type" value={result.dca_params.orderType === "post_only" ? "Post-Only (Maker)" : "Limit"} />
                  <ParamRow label="Price Offset" value={`$${result.dca_params.limitPriceOffset.toFixed(2)}`} />
                </div>
              )}
              {result.grid_params && (
                <div>
                  <ParamRow label="Lower Price" value={`$${result.grid_params.lowerPrice.toFixed(2)}`} />
                  <ParamRow label="Upper Price" value={`$${result.grid_params.upperPrice.toFixed(2)}`} />
                  <ParamRow label="Grid Levels" value={`${result.grid_params.gridLevels} level`} />
                  <ParamRow label="Amount per Grid" value={`$${result.grid_params.amountPerGrid.toFixed(2)} USDC`} />
                  <ParamRow label="Mode" value={result.grid_params.mode.charAt(0).toUpperCase() + result.grid_params.mode.slice(1)} />
                  <ParamRow label="Order Type" value={result.grid_params.orderType === "post_only" ? "Post-Only (Maker)" : "Limit"} />
                  {result.grid_params.stopLoss && (
                    <ParamRow label="Stop Loss" value={`$${result.grid_params.stopLoss.toFixed(2)}`} />
                  )}
                  {result.grid_params.takeProfit && (
                    <ParamRow label="Take Profit" value={`$${result.grid_params.takeProfit.toFixed(2)}`} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* CTA — link ke halaman strategi yang sesuai DEX */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href={selectedDex === "extended" ? "/extended" : selectedDex === "ethereal" ? "/ethereal" : "/lighter"}>
              <Button className="w-full sm:w-auto gap-2" variant="default">
                <Bot className="w-4 h-4" />
                Buat Strategi {selectedDex === "extended" ? "Extended" : "Lighter"} Baru
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full sm:w-auto gap-2"
              onClick={() => { setResult(null); setError(null); }}
            >
              Analisis Ulang
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            ⚠ Rekomendasi AI bersifat informatif. Selalu evaluasi kondisi pasar secara mandiri sebelum mengaktifkan bot.
          </p>
        </div>
      )}
    </div>
  );
}
