import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Play, Square, Trash2, Activity, BarChart2, Zap, LineChart, Pencil, Plus, Loader2, RefreshCw, Settings2, Wallet, Sparkles, ChevronsUpDown, Check, TrendingUp, TrendingDown, Minus, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EthMarket {
  id: string;
  onchainId: number;
  ticker: string;
  displayTicker: string;
  baseAsset: string;
  quoteAsset: string;
  minOrderSize: number;
  tickSize: number;
  lotSize: number;
  lastPrice: number;
}

interface EthStrategy {
  id: number;
  name: string;
  type: "dca" | "grid";
  exchange: string;
  marketSymbol: string;
  marketIndex: number;
  isRunning: boolean;
  isActive: boolean;
  totalOrders: number;
  successfulOrders: number;
  totalBought: string;
  totalSold: string;
  avgBuyPrice: string;
  avgSellPrice: string;
  realizedPnl: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  dcaConfig?: {
    amountPerOrder: number;
    intervalMinutes: number;
    side: "buy" | "sell";
    orderType: string;
    limitPriceOffset?: number;
  } | null;
  gridConfig?: {
    lowerPrice: number;
    upperPrice: number;
    gridLevels: number;
    amountPerGrid: number;
    mode: string;
    orderType: string;
    limitPriceOffset?: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
  } | null;
}

interface EthAccount {
  walletAddress?: string;
  hasCredentials: boolean;
  balances: { tokenName?: string; amount: string; available: string }[];
  positions: any[];
  openOrders: any[];
  network?: string;
}

interface EthCredentials {
  hasCredentials: boolean;
  walletAddress?: string;
  subaccountId?: string;
  etherealNetwork?: string;
}

// ── AI Result types & card ─────────────────────────────────────────────────────

interface AIResult {
  reasoning: string;
  marketCondition: "bullish" | "bearish" | "sideways" | "volatile";
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  modelUsed: string;
  modelTier: string;
}

function AIInsightCard({ result }: { result: AIResult }) {
  const conditionIcon = {
    bullish: <TrendingUp className="w-3.5 h-3.5 text-green-400" />,
    bearish: <TrendingDown className="w-3.5 h-3.5 text-destructive" />,
    sideways: <Minus className="w-3.5 h-3.5 text-yellow-400" />,
    volatile: <Sparkles className="w-3.5 h-3.5 text-primary" />,
  }[result.marketCondition];

  const riskColor = {
    low: "text-green-400",
    medium: "text-yellow-400",
    high: "text-destructive",
  }[result.riskLevel];

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-300">
          <Sparkles className="w-3.5 h-3.5" />
          Analisis AI — {result.modelTier}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {conditionIcon}
            <span className="capitalize">{result.marketCondition === "sideways" ? "Sideways" : result.marketCondition === "bullish" ? "Bullish" : result.marketCondition === "bearish" ? "Bearish" : "Volatile"}</span>
          </div>
          <Badge variant="outline" className={cn("text-xs px-1.5 py-0", riskColor)}>
            {result.riskLevel === "low" ? "risiko rendah" : result.riskLevel === "medium" ? "risiko sedang" : "risiko tinggi"}
          </Badge>
          <span className="text-xs text-muted-foreground">{result.confidence}% keyakinan</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{result.reasoning}</p>
    </div>
  );
}

// ── API ────────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api/ethereal/strategies${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ── Log Section ───────────────────────────────────────────────────────────────

function EthLogSection({ strategyId }: { strategyId: number }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    apiFetch(`/logs/strategy/${strategyId}?limit=30`)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [strategyId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const levelColor = (lvl: string) => {
    if (lvl === "error") return "text-destructive";
    if (lvl === "warn") return "text-yellow-400";
    if (lvl === "success") return "text-green-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Log Bot</h4>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {loading && logs.length === 0 ? (
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Belum ada log</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto text-xs font-mono">
          {logs.slice(0, 30).map((log: any, i: number) => (
            <div key={log.id ?? i} className="flex gap-2 items-start">
              <span className="text-muted-foreground shrink-0">
                {new Date(log.createdAt).toLocaleTimeString("id-ID")}
              </span>
              <span className={`shrink-0 font-bold w-14 ${levelColor(log.level)}`}>
                [{log.level.toUpperCase().slice(0, 5)}]
              </span>
              <span className="flex-1 text-foreground/80 break-all">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Market Picker (Popover+Command) ───────────────────────────────────────────

function EthMarketPicker({
  markets,
  selected,
  onSelect,
}: {
  markets: EthMarket[];
  selected: string;
  onSelect: (ticker: string, onchainId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedMarket = markets.find((m) => m.ticker === selected);

  return (
    <div className="space-y-2">
      <Label>Market</Label>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-background font-normal"
          >
            {selectedMarket ? (
              <span className="font-mono text-sm">{selectedMarket.displayTicker || selectedMarket.ticker}</span>
            ) : markets.length === 0 ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Memuat market...
              </span>
            ) : (
              <span className="text-muted-foreground">Pilih market...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 z-[200]" align="start">
          <Command>
            <CommandInput placeholder="Cari market (mis. ETH, BTC)..." />
            <CommandList className="max-h-[280px] overflow-y-auto">
              <CommandEmpty>Market tidak ditemukan.</CommandEmpty>
              <CommandGroup heading={`${markets.length} market tersedia`}>
                {markets.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.ticker} ${m.displayTicker} ${m.baseAsset}`}
                    onSelect={() => {
                      onSelect(m.ticker, m.onchainId);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", selected === m.ticker ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-sm">{m.displayTicker || m.ticker}</span>
                    {m.lastPrice > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground font-mono">
                        ${m.lastPrice.toFixed(2)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── AI Auto-fill Button ────────────────────────────────────────────────────────

function EthAiButton({
  strategyType,
  marketSymbol,
  onResult,
}: {
  strategyType: "dca" | "grid";
  marketSymbol: string;
  onResult: (data: any) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!marketSymbol) {
      toast({ title: "Pilih market dulu", description: "Pilih market Ethereal sebelum menggunakan AI.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strategyType, marketSymbol, exchange: "ethereal" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengambil rekomendasi AI");
      onResult(json);
      toast({
        title: "Parameter diisi otomatis AI",
        description: `Rekomendasi ${strategyType.toUpperCase()} untuk ${marketSymbol} berhasil dimuat.`,
      });
    } catch (err: any) {
      toast({ title: "AI Gagal", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2 border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:text-violet-200 hover:border-violet-500/50"
      onClick={handleClick}
      disabled={loading || !marketSymbol}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      {loading ? "Menganalisis pasar..." : "Isi Otomatis Parameter (AI)"}
    </Button>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────

function EthCreateModal({
  open,
  onClose,
  onCreated,
  markets,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  markets: EthMarket[];
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"dca" | "grid">("dca");
  const [busy, setBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);

  const [form, setForm] = useState({
    name: "",
    marketSymbol: "",
    marketIndex: 0,
    amountPerOrder: 10,
    intervalMinutes: 60,
    side: "buy",
    orderType: "limit",
    limitPriceOffset: 0,
    lowerPrice: "",
    upperPrice: "",
    gridLevels: 10,
    amountPerGrid: 10,
    mode: "neutral",
    stopLoss: "",
    takeProfit: "",
  });

  const setField = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const selectMarket = (ticker: string, onchainId: number) => {
    setForm((f) => ({ ...f, marketSymbol: ticker, marketIndex: onchainId }));
    setAiResult(null);
  };

  const handleAiResult = (data: any, strategyType: "dca" | "grid") => {
    if (strategyType === "dca") {
      const p = data?.dca_params;
      if (!p) return;
      if (p.amountPerOrder != null) setField("amountPerOrder", p.amountPerOrder);
      if (p.intervalMinutes != null) setField("intervalMinutes", p.intervalMinutes);
      if (p.side) setField("side", p.side);
      if (p.orderType) setField("orderType", p.orderType);
      if (p.limitPriceOffset != null) setField("limitPriceOffset", p.limitPriceOffset);
    } else {
      const p = data?.grid_params;
      if (!p) return;
      if (p.lowerPrice != null) setField("lowerPrice", String(p.lowerPrice));
      if (p.upperPrice != null) setField("upperPrice", String(p.upperPrice));
      if (p.gridLevels != null) setField("gridLevels", p.gridLevels);
      if (p.amountPerGrid != null) setField("amountPerGrid", p.amountPerGrid);
      if (p.mode) setField("mode", p.mode);
      if (p.orderType) setField("orderType", p.orderType);
      if (p.limitPriceOffset != null) setField("limitPriceOffset", p.limitPriceOffset);
      if (p.stopLoss != null) setField("stopLoss", String(p.stopLoss));
      if (p.takeProfit != null) setField("takeProfit", String(p.takeProfit));
    }
    if (data.reasoning) {
      setAiResult({
        reasoning: data.reasoning,
        marketCondition: data.marketCondition,
        riskLevel: data.riskLevel,
        confidence: data.confidence,
        modelUsed: data.modelUsed,
        modelTier: data.modelTier,
      });
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nama strategi wajib diisi", variant: "destructive" });
      return;
    }
    if (!form.marketSymbol) {
      toast({ title: "Pilih market terlebih dahulu", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      if (tab === "dca") {
        await apiFetch("/", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            type: "dca",
            marketSymbol: form.marketSymbol,
            marketIndex: form.marketIndex,
            dcaConfig: {
              amountPerOrder: Number(form.amountPerOrder),
              intervalMinutes: Number(form.intervalMinutes),
              side: form.side,
              orderType: form.orderType,
              limitPriceOffset: Number(form.limitPriceOffset ?? 0),
            },
          }),
        });
      } else {
        if (!form.lowerPrice || !form.upperPrice) {
          toast({ title: "Rentang harga harus diisi", variant: "destructive" });
          setBusy(false);
          return;
        }
        if (Number(form.upperPrice) <= Number(form.lowerPrice)) {
          toast({ title: "Harga atas harus lebih besar dari harga bawah", variant: "destructive" });
          setBusy(false);
          return;
        }
        await apiFetch("/", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            type: "grid",
            marketSymbol: form.marketSymbol,
            marketIndex: form.marketIndex,
            gridConfig: {
              lowerPrice: Number(form.lowerPrice),
              upperPrice: Number(form.upperPrice),
              gridLevels: Number(form.gridLevels),
              amountPerGrid: Number(form.amountPerGrid),
              mode: form.mode,
              orderType: form.orderType,
              limitPriceOffset: Number(form.limitPriceOffset ?? 0),
              stopLoss: form.stopLoss ? Number(form.stopLoss) : null,
              takeProfit: form.takeProfit ? Number(form.takeProfit) : null,
            },
          }),
        });
      }
      toast({ title: "Strategi berhasil dibuat" });
      onCreated();
      onClose();
    } catch (err: any) {
      toast({ title: "Gagal membuat strategi", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const showLimitOffset = form.orderType === "limit" || form.orderType === "post_only";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExchangeLogo exchange="ethereal" size={20} />
            Buat Strategi — Ethereal DEX
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setAiResult(null); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dca">DCA</TabsTrigger>
            <TabsTrigger value="grid">Grid</TabsTrigger>
          </TabsList>

          {/* Common fields */}
          <div className="space-y-3 mt-4 mb-2">
            <div className="space-y-2">
              <Label>Nama Strategi</Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="contoh: ETH DCA Harian"
                className="bg-background"
              />
            </div>
            <EthMarketPicker
              markets={markets}
              selected={form.marketSymbol}
              onSelect={selectMarket}
            />
          </div>

          <TabsContent value="dca" className="space-y-3 mt-2">
            <EthAiButton
              strategyType="dca"
              marketSymbol={form.marketSymbol}
              onResult={(data) => handleAiResult(data, "dca")}
            />

            {aiResult && <AIInsightCard result={aiResult} />}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Jumlah (USDe)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.amountPerOrder}
                  onChange={(e) => setField("amountPerOrder", e.target.value)}
                  placeholder="100"
                  className="bg-background font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Interval (Menit)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.intervalMinutes}
                  onChange={(e) => setField("intervalMinutes", e.target.value)}
                  placeholder="1440"
                  className="bg-background font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sisi</Label>
                <Select value={form.side} onValueChange={(v) => setField("side", v)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipe Order</Label>
                <Select value={form.orderType} onValueChange={(v) => setField("orderType", v)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post_only">Post-Only (Maker) ⭐⭐</SelectItem>
                    <SelectItem value="limit">Limit (Maker/Taker) ⭐</SelectItem>
                    <SelectItem value="market">Market (Taker)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {showLimitOffset && (
              <div className="space-y-2">
                <Label>
                  Limit Price Offset (USDe)
                  <span className="ml-1.5 text-xs text-muted-foreground">— offset dari harga pasar saat eksekusi</span>
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.limitPriceOffset}
                  onChange={(e) => setField("limitPriceOffset", e.target.value)}
                  placeholder="mis. 10"
                  className="bg-background font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Buy: order di <strong>bawah</strong> harga pasar. Sell: di <strong>atas</strong> harga pasar.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="grid" className="space-y-3 mt-2">
            <EthAiButton
              strategyType="grid"
              marketSymbol={form.marketSymbol}
              onResult={(data) => handleAiResult(data, "grid")}
            />

            {aiResult && <AIInsightCard result={aiResult} />}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Harga Bawah (USDe)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.lowerPrice}
                  onChange={(e) => setField("lowerPrice", e.target.value)}
                  placeholder="e.g. 2000"
                  className="bg-background font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Harga Atas (USDe)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.upperPrice}
                  onChange={(e) => setField("upperPrice", e.target.value)}
                  placeholder="e.g. 3000"
                  className="bg-background font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Level Grid</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.gridLevels}
                  onChange={(e) => setField("gridLevels", e.target.value)}
                  placeholder="10"
                  className="bg-background font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Jumlah per Grid (USDe)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.amountPerGrid}
                  onChange={(e) => setField("amountPerGrid", e.target.value)}
                  placeholder="50"
                  className="bg-background font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Mode Grid</Label>
                <Select value={form.mode} onValueChange={(v) => setField("mode", v)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neutral">Netral (Beli &amp; Jual)</SelectItem>
                    <SelectItem value="long">Long (Beli Saja)</SelectItem>
                    <SelectItem value="short">Short (Jual Saja)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipe Order</Label>
                <Select value={form.orderType} onValueChange={(v) => setField("orderType", v)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post_only">Post-Only (Maker) ⭐⭐</SelectItem>
                    <SelectItem value="limit">Limit (Maker/Taker) ⭐</SelectItem>
                    <SelectItem value="market">Market (Taker)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {showLimitOffset && (
              <div className="space-y-2">
                <Label>
                  Limit Price Offset (USDe)
                  <span className="ml-1.5 text-xs text-muted-foreground">— offset dari harga pasar</span>
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.limitPriceOffset}
                  onChange={(e) => setField("limitPriceOffset", e.target.value)}
                  placeholder="mis. 10"
                  className="bg-background font-mono"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Stop Loss (USDe, opsional)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.stopLoss}
                  onChange={(e) => setField("stopLoss", e.target.value)}
                  placeholder="mis. 1700"
                  className="bg-background font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Take Profit (USDe, opsional)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.takeProfit}
                  onChange={(e) => setField("takeProfit", e.target.value)}
                  placeholder="mis. 2400"
                  className="bg-background font-mono"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="pt-4 flex gap-2 justify-end border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={busy}>Batal</Button>
          <Button
            onClick={handleSubmit}
            disabled={busy}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Buat Strategi Ethereal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Config Modal ──────────────────────────────────────────────────────────────

function EthConfigModal({
  open,
  onClose,
  credentials,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  credentials: EthCredentials;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [subaccountId, setSubaccountId] = useState(credentials.subaccountId ?? "");
  const [network, setNetwork] = useState<"mainnet" | "testnet">(
    (credentials.etherealNetwork ?? "mainnet") as "mainnet" | "testnet"
  );

  const save = async () => {
    if (!privateKey && !credentials.hasCredentials) {
      toast({ title: "Private key wajib diisi", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/credentials", {
        method: "PUT",
        body: JSON.stringify({
          ...(privateKey && { privateKey }),
          ...(subaccountId && { subaccountId }),
          etherealNetwork: network,
        }),
      });
      toast({ title: "Credentials Ethereal tersimpan" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Gagal menyimpan", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-400" />
            Konfigurasi Ethereal DEX
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Private Key (EVM, 64 hex chars)</Label>
            <Input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={credentials.hasCredentials ? "••••••••••••••• (tersimpan)" : "0x..."}
            />
            {credentials.walletAddress && (
              <p className="text-xs text-muted-foreground mt-1">
                Wallet: {credentials.walletAddress.slice(0, 10)}...{credentials.walletAddress.slice(-8)}
              </p>
            )}
          </div>
          <div>
            <Label>Subaccount ID (UUID dari Ethereal)</Label>
            <Input
              value={subaccountId}
              onChange={(e) => setSubaccountId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Dapatkan dari Settings → API Keys di <a href="https://app.ethereal.trade" target="_blank" rel="noopener noreferrer" className="underline text-purple-400">app.ethereal.trade</a>
            </p>
          </div>
          <div>
            <Label>Network</Label>
            <Select value={network} onValueChange={(v) => setNetwork(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mainnet">Mainnet</SelectItem>
                <SelectItem value="testnet">Testnet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>Batal</Button>
          <Button onClick={save} disabled={busy} className="bg-purple-600 hover:bg-purple-700 text-white">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Simpan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Strategy Card ──────────────────────────────────────────────────────────────

function EthStrategyCard({
  strategy,
  onToggle,
  onDelete,
  onShowLog,
  isBusy,
}: {
  strategy: EthStrategy;
  onToggle: () => void;
  onDelete: () => void;
  onShowLog: () => void;
  isBusy: boolean;
}) {
  const pnl = parseFloat(strategy.realizedPnl ?? "0");

  return (
    <Card className="glass-panel flex flex-col overflow-hidden relative group">
      {strategy.isRunning && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/50 via-purple-400 to-purple-500/50 animate-pulse" />
      )}

      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-bold">{strategy.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-mono bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20">
                {strategy.marketSymbol}
              </span>
              <span className="text-xs uppercase font-bold text-purple-400 tracking-wider">
                {strategy.type}
              </span>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Ethereal
              </span>
            </div>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            strategy.isRunning ? "bg-purple-500/20 text-purple-300" : "bg-muted text-muted-foreground"
          }`}>
            {strategy.isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            )}
            {strategy.isRunning ? "Berjalan" : "Berhenti"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-4 flex-1 space-y-4">
        {/* Config preview */}
        {strategy.type === "dca" && strategy.dcaConfig && (
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div><div className="text-xs text-muted-foreground">Jumlah</div><div className="font-mono">${strategy.dcaConfig.amountPerOrder}</div></div>
            <div><div className="text-xs text-muted-foreground">Interval</div><div className="font-mono">{strategy.dcaConfig.intervalMinutes}m</div></div>
            <div><div className="text-xs text-muted-foreground">Sisi</div><div className={`font-medium ${strategy.dcaConfig.side === "buy" ? "text-success" : "text-destructive"}`}>{strategy.dcaConfig.side.toUpperCase()}</div></div>
            <div><div className="text-xs text-muted-foreground">Order</div><div className="font-mono text-xs capitalize">{strategy.dcaConfig.orderType}</div></div>
          </div>
        )}
        {strategy.type === "grid" && strategy.gridConfig && (
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div><div className="text-xs text-muted-foreground">Rentang</div><div className="font-mono text-xs">${strategy.gridConfig.lowerPrice}–${strategy.gridConfig.upperPrice}</div></div>
            <div><div className="text-xs text-muted-foreground">Level</div><div className="font-mono">{strategy.gridConfig.gridLevels}</div></div>
            <div><div className="text-xs text-muted-foreground">Per Grid</div><div className="font-mono">${strategy.gridConfig.amountPerGrid}</div></div>
            <div><div className="text-xs text-muted-foreground">Mode</div><div className="font-mono capitalize">{strategy.gridConfig.mode}</div></div>
            {strategy.gridConfig.orderType && <div><div className="text-xs text-muted-foreground">Order</div><div className="font-mono text-xs capitalize">{strategy.gridConfig.orderType}</div></div>}
            {strategy.gridConfig.stopLoss && <div><div className="text-xs text-muted-foreground">Stop Loss</div><div className="font-mono text-destructive">${strategy.gridConfig.stopLoss}</div></div>}
            {strategy.gridConfig.takeProfit && <div><div className="text-xs text-muted-foreground">Take Profit</div><div className="font-mono text-success">${strategy.gridConfig.takeProfit}</div></div>}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          <div className="bg-background/50 rounded-lg p-2 border border-border/30">
            <div className="font-bold font-mono">{strategy.totalOrders}</div>
            <div className="text-muted-foreground">Order</div>
          </div>
          <div className="bg-background/50 rounded-lg p-2 border border-border/30">
            <div className="font-bold font-mono">{strategy.successfulOrders}</div>
            <div className="text-muted-foreground">Sukses</div>
          </div>
          <div className={`bg-background/50 rounded-lg p-2 border border-border/30 ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
            <div className="font-bold font-mono">${pnl.toFixed(2)}</div>
            <div className="text-muted-foreground">PnL</div>
          </div>
        </div>

        {strategy.nextRunAt && (
          <p className="text-[11px] text-muted-foreground">
            Berikutnya: {new Date(strategy.nextRunAt).toLocaleString("id-ID")}
          </p>
        )}
      </CardContent>

      <div className="p-4 pt-0 flex items-center gap-2">
        <Button
          variant={strategy.isRunning ? "destructive" : "default"}
          size="sm"
          onClick={onToggle}
          disabled={isBusy}
          className={strategy.isRunning ? "" : "bg-purple-600 hover:bg-purple-700 text-white"}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : strategy.isRunning ? (
            <Square className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span className="ml-1">{strategy.isRunning ? "Stop" : "Start"}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onShowLog} title="Lihat Log"
          className="hover:bg-purple-500/10 hover:text-purple-400">
          <ScrollText className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={strategy.isRunning || isBusy} className="ml-auto text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

// ── Log Dialog ────────────────────────────────────────────────────────────────

function EthLogDialog({ strategyId, strategyName, open, onClose }: { strategyId: number; strategyName: string; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[620px] bg-card border-border max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            Log Ethereal — {strategyName}
          </DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <EthLogSection strategyId={strategyId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Account Widget ────────────────────────────────────────────────────────────

function EthAccountWidget({ account }: { account: EthAccount | null }) {
  if (!account?.hasCredentials) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="w-4 h-4" />
        <span>Belum terkonfigurasi</span>
      </div>
    );
  }

  const usde = account.balances.find(
    (b) => b.tokenName?.toLowerCase().includes("usde") || b.tokenName?.toLowerCase().includes("usd")
  );

  const totalUnrealizedPnl = account.positions?.reduce(
    (sum: number, p: any) => sum + parseFloat(p.unrealizedPnl ?? "0"),
    0
  ) ?? 0;
  const hasPositions = (account.positions?.length ?? 0) > 0;

  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-lg">
        <Wallet className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs text-muted-foreground">Saldo USDe:</span>
        <span className="font-mono font-bold text-purple-300">
          {usde ? `$${parseFloat(usde.amount).toFixed(2)}` : "–"}
        </span>
      </div>
      {hasPositions && (
        <div className="flex items-center gap-1.5 bg-background/50 border border-border/40 px-2.5 py-1.5 rounded-lg">
          <span className="text-xs text-muted-foreground">{account.positions.length} posisi</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">uPnL:</span>
          <span className={`font-mono font-bold text-xs ${totalUnrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalUnrealizedPnl >= 0 ? "+" : ""}${totalUnrealizedPnl.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EtherealStrategies() {
  const { toast } = useToast();
  const [strategies, setStrategies] = useState<EthStrategy[]>([]);
  const [markets, setMarkets] = useState<EthMarket[]>([]);
  const [account, setAccount] = useState<EthAccount | null>(null);
  const [credentials, setCredentials] = useState<EthCredentials>({ hasCredentials: false });
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [logDialogId, setLogDialogId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    try {
      // Fetch strategies + markets together; credentials fetched separately
      // because /credentials returns 400 when unconfigured, which would cause
      // Promise.all to reject and block market loading.
      const [strats, mks] = await Promise.all([
        apiFetch("/"),
        apiFetch("/markets"),
      ]);
      setStrategies(strats ?? []);
      setMarkets(mks ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
    // Credentials: 400 = belum dikonfigurasi, itu expected bukan error fatal
    try {
      const creds = await apiFetch("/credentials");
      setCredentials(creds);
    } catch {
      setCredentials({ hasCredentials: false });
    }
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const acc = await apiFetch("/account");
      setAccount(acc);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadAccount();
    const t = setInterval(() => {
      apiFetch("/").then(setStrategies).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [loadAll, loadAccount]);

  const toggleBot = async (s: EthStrategy) => {
    setBusyIds((prev) => new Set(prev).add(s.id));
    try {
      if (s.isRunning) {
        await apiFetch(`/stop/${s.id}`, { method: "POST" });
        toast({ title: `Bot ${s.name} dihentikan` });
      } else {
        await apiFetch(`/start/${s.id}`, { method: "POST" });
        toast({ title: `Bot ${s.name} dimulai` });
      }
      await loadAll();
    } catch (err: any) {
      toast({ title: "Gagal", description: err.message, variant: "destructive" });
    } finally {
      setBusyIds((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
    }
  };

  const deleteStrategy = async (id: number) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await apiFetch(`/${id}`, { method: "DELETE" });
      toast({ title: "Strategi dihapus" });
      await loadAll();
    } catch (err: any) {
      toast({ title: "Gagal hapus", description: err.message, variant: "destructive" });
    } finally {
      setBusyIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setDeleteConfirmId(null);
    }
  };

  const logDialog = strategies.find((s) => s.id === logDialogId);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <ExchangeLogo exchange="ethereal" size={32} className="rounded-lg" />
            Strategi Ethereal
          </h1>
          <p className="text-muted-foreground mt-1">
            Bot trading otomatis di Ethereal DEX
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <EthAccountWidget account={account} />
          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
            <Settings2 className="w-4 h-4 mr-1.5" />
            Konfigurasi
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Buat Strategi
          </Button>
        </div>
      </header>

      {/* DEX badge */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm w-fit ${
        credentials.hasCredentials
          ? "bg-purple-500/5 border-purple-500/20"
          : "bg-muted border-border"
      }`}>
        <ExchangeLogo exchange="ethereal" size={14} />
        <span className="text-purple-300 font-medium">Ethereal DEX</span>
        {credentials.hasCredentials ? (
          <span className="text-green-400 font-medium">aktif ✓</span>
        ) : (
          <button className="text-yellow-400 font-medium hover:underline" onClick={() => setShowConfig(true)}>
            belum dikonfigurasi — paper trade
          </button>
        )}
      </div>

      {/* Strategies grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass-panel flex flex-col overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-32 bg-primary/10 animate-pulse rounded" />
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="h-6 w-14 bg-muted animate-pulse rounded-full" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1">
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
              </CardContent>
              <CardFooter className="flex gap-2 pt-3 border-t border-border/50">
                <div className="h-8 flex-1 bg-muted animate-pulse rounded" />
                <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                <div className="h-8 w-8 bg-muted animate-pulse rounded" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border flex flex-col items-center">
          <Zap className="w-16 h-16 text-purple-400 mb-4 opacity-20" />
          <h3 className="text-xl font-bold text-foreground">Belum Ada Strategi Ethereal</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Kamu belum membuat bot Ethereal. Klik "Buat Strategi" untuk membuat DCA atau Grid bot di Ethereal DEX.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {strategies.map((s) => (
            <EthStrategyCard
              key={s.id}
              strategy={s}
              isBusy={busyIds.has(s.id)}
              onToggle={() => toggleBot(s)}
              onDelete={() => setDeleteConfirmId(s.id)}
              onShowLog={() => setLogDialogId(s.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <EthCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={loadAll}
        markets={markets}
      />

      <EthConfigModal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        credentials={credentials}
        onSaved={() => { loadAll(); loadAccount(); }}
      />

      {logDialog && (
        <EthLogDialog
          strategyId={logDialog.id}
          strategyName={logDialog.name}
          open={true}
          onClose={() => setLogDialogId(null)}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(v) => !v && setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-[360px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Hapus Strategi?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Strategi ini akan dihapus permanen. Histori trade tetap tersimpan.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId !== null && deleteStrategy(deleteConfirmId)}>
              Hapus
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
