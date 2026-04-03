import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useCreateStrategy, useGetOrderBooks } from "@workspace/api-client-react";
import { Plus, Loader2, ChevronsUpDown, Check, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";

const dcaSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  marketIndex: z.coerce.number({ required_error: "Pilih pasar terlebih dahulu" }),
  amountPerOrder: z.coerce.number().positive("Jumlah harus positif"),
  intervalMinutes: z.coerce.number().min(1, "Interval minimal 1 menit"),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit", "post_only"]),
  limitPriceOffset: z.coerce.number().min(0).optional(),
});

const optionalPositiveNumber = z.preprocess(
  (val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  },
  z.number().positive("Must be a positive number").optional()
);

const gridSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  marketIndex: z.coerce.number({ required_error: "Pilih pasar terlebih dahulu" }),
  lowerPrice: z.coerce.number().positive("Harga bawah harus positif"),
  upperPrice: z.coerce.number().positive("Harga atas harus positif"),
  gridLevels: z.coerce.number().min(2).max(100),
  amountPerGrid: z.coerce.number().positive("Jumlah harus positif"),
  mode: z.enum(["neutral", "long", "short"]),
  orderType: z.enum(["market", "limit", "post_only"]),
  limitPriceOffset: z.coerce.number().min(0).optional(),
  stopLoss: optionalPositiveNumber,
  takeProfit: optionalPositiveNumber,
}).refine(data => data.upperPrice > data.lowerPrice, {
  message: "Harga atas harus lebih besar dari harga bawah",
  path: ["upperPrice"],
}).refine(data => !data.stopLoss || data.stopLoss < data.lowerPrice, {
  message: "Stop Loss harus di bawah Harga Bawah (agar bot tidak langsung berhenti)",
  path: ["stopLoss"],
}).refine(data => !data.takeProfit || data.takeProfit > data.upperPrice, {
  message: "Take Profit harus di atas Harga Atas (agar bot tidak langsung berhenti)",
  path: ["takeProfit"],
});

type DcaFormData = z.infer<typeof dcaSchema>;
type GridFormData = z.infer<typeof gridSchema>;

interface MarketPickerProps {
  selectedMarket: { index: number; label: string } | null;
  onSelect: (m: { index: number; label: string }) => void;
  error?: string;
  markets: Array<{ index: number; symbol: string; type: string }>;
}

function MarketPicker({ selectedMarket, onSelect, error, markets }: MarketPickerProps) {
  const [open, setOpen] = useState(false);
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
              <span className="font-mono text-sm">{selectedMarket.label}</span>
            ) : (
              <span className="text-muted-foreground">Cari pasar (mis. BTC, ETH)...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 z-[200]" align="start">
          <Command>
            <CommandInput placeholder="Cari pasar..." />
            <CommandList className="max-h-[240px] overflow-y-auto">
              <CommandEmpty>Pasar tidak ditemukan.</CommandEmpty>
              <CommandGroup>
                {markets.map(m => {
                  const label = `${m.symbol} (${m.type})`;
                  return (
                    <CommandItem
                      key={m.index}
                      value={label}
                      onSelect={() => {
                        onSelect({ index: m.index, label });
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 h-4 w-4", selectedMarket?.index === m.index ? "opacity-100" : "opacity-0")}
                      />
                      <span className="font-mono text-sm">{m.symbol}</span>
                      <span className="ml-2 text-xs text-muted-foreground capitalize">{m.type}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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
    bullish: <TrendingUp className="w-3.5 h-3.5 text-success" />,
    bearish: <TrendingDown className="w-3.5 h-3.5 text-destructive" />,
    sideways: <Minus className="w-3.5 h-3.5 text-warning" />,
    volatile: <Sparkles className="w-3.5 h-3.5 text-primary" />,
  }[result.marketCondition];

  const riskColor = {
    low: "text-success",
    medium: "text-warning",
    high: "text-destructive",
  }[result.riskLevel];

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles className="w-3.5 h-3.5" />
          Analisis AI — {result.modelTier}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {conditionIcon}
            <span className="capitalize">{result.marketCondition}</span>
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

// Sanitize numbers from AI — guard against European locale format (comma decimal separator).
// JS JSON.parse normally enforces dot-decimal, but some models occasionally produce
// string fields. This ensures we always store a clean JS number.
function sanitizeAINumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && !isNaN(value)) return value;
  // Handle string like "64956,4" → 64956.4
  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

async function fetchAIAnalysis(strategyType: "dca" | "grid", marketIndex: number) {
  const res = await fetch("/api/ai/analyze", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ strategyType, marketIndex }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "AI request failed" }));
    throw new Error(err.error ?? "AI request failed");
  }
  return res.json();
}

interface DcaFormProps {
  markets: Array<{ index: number; symbol: string; type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

function DcaForm({ markets, onSuccess, onCancel }: DcaFormProps) {
  const { toast } = useToast();
  const [selectedMarket, setSelectedMarket] = useState<{ index: number; label: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);

  const form = useForm<DcaFormData>({
    resolver: zodResolver(dcaSchema),
    defaultValues: { side: "buy", orderType: "market", limitPriceOffset: 0 },
  });

  const watchOrderType = form.watch("orderType");

  const createMutation = useCreateStrategy({
    mutation: {
      onSuccess: () => {
        toast({ title: "Strategi Dibuat", description: "Bot DCA kamu siap." });
        onSuccess();
      },
      onError: (err: any) => {
        toast({ title: "Kesalahan", description: err.message || "Gagal membuat strategi", variant: "destructive" });
      },
    },
  });

  const handleAIAnalyze = async () => {
    if (!selectedMarket) {
      toast({ title: "Pilih pasar terlebih dahulu", description: "Pilih pasar sebelum menjalankan analisis AI.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const data = await fetchAIAnalysis("dca", selectedMarket.index);
      const rec = data.dca_params;
      if (!rec) throw new Error("AI tidak mengembalikan parameter DCA");
      const amountPerOrder = sanitizeAINumber(rec.amountPerOrder);
      const intervalMinutes = sanitizeAINumber(rec.intervalMinutes);
      const limitPriceOffset = sanitizeAINumber(rec.limitPriceOffset);
      if (amountPerOrder) form.setValue("amountPerOrder", amountPerOrder);
      if (intervalMinutes) form.setValue("intervalMinutes", intervalMinutes);
      if (rec.side) form.setValue("side", rec.side);
      if (rec.orderType) form.setValue("orderType", rec.orderType);
      if (limitPriceOffset !== undefined) form.setValue("limitPriceOffset", limitPriceOffset);
      setAiResult({ reasoning: data.reasoning, marketCondition: data.marketCondition, riskLevel: data.riskLevel, confidence: data.confidence, modelUsed: data.modelUsed, modelTier: data.modelTier });
      toast({ title: "Analisis AI Selesai", description: `Parameter diisi otomatis menggunakan ${data.modelTier}` });
    } catch (err: any) {
      toast({ title: "Analisis AI Gagal", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = (data: DcaFormData) => {
    createMutation.mutate({
      data: {
        name: data.name,
        type: "dca",
        marketIndex: data.marketIndex,
        dcaConfig: {
          amountPerOrder: data.amountPerOrder,
          intervalMinutes: data.intervalMinutes,
          side: data.side,
          orderType: data.orderType,
          limitPriceOffset: (data.orderType === "limit" || data.orderType === "post_only") ? (data.limitPriceOffset ?? 0) : 0,
        },
      },
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label>Nama Strategi</Label>
        <Input {...form.register("name")} placeholder="mis. ETH Akumulasi Mingguan" className="bg-background" />
        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
      </div>

      <MarketPicker
        markets={markets}
        selectedMarket={selectedMarket}
        onSelect={(m) => { setSelectedMarket(m); form.setValue("marketIndex", m.index, { shouldValidate: true }); setAiResult(null); }}
        error={form.formState.errors.marketIndex?.message}
      />

      <Button
        type="button"
        variant="outline"
        className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-2"
        onClick={handleAIAnalyze}
        disabled={aiLoading || !selectedMarket}
      >
        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {aiLoading ? "Menganalisis pasar..." : "Isi Otomatis Parameter (AI)"}
      </Button>

      {aiResult && <AIInsightCard result={aiResult} />}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Jumlah (USDC)</Label>
          <Input type="text" inputMode="decimal" {...form.register("amountPerOrder")} placeholder="100" className="bg-background font-mono" />
          {form.formState.errors.amountPerOrder && <p className="text-xs text-destructive">{form.formState.errors.amountPerOrder.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Interval (Menit)</Label>
          <Input type="text" inputMode="numeric" {...form.register("intervalMinutes")} placeholder="1440" className="bg-background font-mono" />
          {form.formState.errors.intervalMinutes && <p className="text-xs text-destructive">{form.formState.errors.intervalMinutes.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Sisi</Label>
          <Select onValueChange={(v: any) => form.setValue("side", v)} value={form.watch("side") || "buy"}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipe Order</Label>
          <Select onValueChange={(v: any) => form.setValue("orderType", v)} value={form.watch("orderType") || "limit"}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="post_only">Post-Only (Maker Only) ⭐⭐</SelectItem>
              <SelectItem value="limit">Limit (Maker/Taker) ⭐</SelectItem>
              <SelectItem value="market">Market (Taker)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(watchOrderType === "limit" || watchOrderType === "post_only") && (
        <div className="space-y-2">
          <Label>
            Limit Price Offset (USDC)
            <span className="ml-1.5 text-xs text-muted-foreground">— offset dari harga pasar saat eksekusi</span>
          </Label>
          <Input type="text" inputMode="decimal" {...form.register("limitPriceOffset")} placeholder="mis. 10" className="bg-background font-mono" />
          <p className="text-xs text-muted-foreground">
            Buy: order di <strong>bawah</strong> harga pasar. Sell: di <strong>atas</strong> harga pasar.
          </p>
          {form.formState.errors.limitPriceOffset && <p className="text-xs text-destructive">{form.formState.errors.limitPriceOffset.message}</p>}
        </div>
      )}

      <div className="pt-4 flex justify-end gap-3 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={createMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white">
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Buat Bot Lighter
        </Button>
      </div>
    </form>
  );
}

interface GridFormProps {
  markets: Array<{ index: number; symbol: string; type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

function GridForm({ markets, onSuccess, onCancel }: GridFormProps) {
  const { toast } = useToast();
  const [selectedMarket, setSelectedMarket] = useState<{ index: number; label: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);

  const form = useForm<GridFormData>({
    resolver: zodResolver(gridSchema),
    defaultValues: { mode: "neutral", orderType: "limit", limitPriceOffset: 0 },
  });

  const watchOrderType = form.watch("orderType");

  const createMutation = useCreateStrategy({
    mutation: {
      onSuccess: () => {
        toast({ title: "Strategi Dibuat", description: "Bot Grid kamu siap." });
        onSuccess();
      },
      onError: (err: any) => {
        toast({ title: "Kesalahan", description: err.message || "Gagal membuat strategi", variant: "destructive" });
      },
    },
  });

  const handleAIAnalyze = async () => {
    if (!selectedMarket) {
      toast({ title: "Pilih pasar terlebih dahulu", description: "Pilih pasar sebelum menjalankan analisis AI.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const data = await fetchAIAnalysis("grid", selectedMarket.index);
      const rec = data.grid_params;
      if (!rec) throw new Error("AI tidak mengembalikan parameter Grid");
      const lowerPrice = sanitizeAINumber(rec.lowerPrice);
      const upperPrice = sanitizeAINumber(rec.upperPrice);
      const gridLevels = sanitizeAINumber(rec.gridLevels);
      const amountPerGrid = sanitizeAINumber(rec.amountPerGrid);
      const limitPriceOffset = sanitizeAINumber(rec.limitPriceOffset);
      const stopLoss = sanitizeAINumber(rec.stopLoss);
      const takeProfit = sanitizeAINumber(rec.takeProfit);
      if (lowerPrice) form.setValue("lowerPrice", lowerPrice, { shouldValidate: true });
      if (upperPrice) form.setValue("upperPrice", upperPrice, { shouldValidate: true });
      if (gridLevels) form.setValue("gridLevels", gridLevels, { shouldValidate: true });
      if (amountPerGrid) form.setValue("amountPerGrid", amountPerGrid, { shouldValidate: true });
      if (rec.mode) form.setValue("mode", rec.mode, { shouldValidate: true });
      if (rec.orderType) form.setValue("orderType", rec.orderType, { shouldValidate: true });
      if (limitPriceOffset !== undefined) form.setValue("limitPriceOffset", limitPriceOffset, { shouldValidate: true });
      const aiLower = lowerPrice ?? 0;
      const aiUpper = upperPrice ?? 0;
      if (stopLoss != null && aiLower > 0) {
        const isReasonable = stopLoss < aiLower && stopLoss >= aiLower * 0.5;
        if (isReasonable) form.setValue("stopLoss", stopLoss, { shouldValidate: true });
        else form.setValue("stopLoss", undefined as any, { shouldValidate: false });
      } else {
        form.setValue("stopLoss", undefined as any, { shouldValidate: false });
      }
      if (takeProfit != null && aiUpper > 0) {
        const isReasonable = takeProfit > aiUpper && takeProfit <= aiUpper * 2;
        if (isReasonable) form.setValue("takeProfit", takeProfit, { shouldValidate: true });
        else form.setValue("takeProfit", undefined as any, { shouldValidate: false });
      } else {
        form.setValue("takeProfit", undefined as any, { shouldValidate: false });
      }
      setAiResult({ reasoning: data.reasoning, marketCondition: data.marketCondition, riskLevel: data.riskLevel, confidence: data.confidence, modelUsed: data.modelUsed, modelTier: data.modelTier });
      toast({ title: "Analisis AI Selesai", description: `Parameter grid diisi otomatis menggunakan ${data.modelTier}` });
    } catch (err: any) {
      toast({ title: "Analisis AI Gagal", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = (data: GridFormData) => {
    createMutation.mutate({
      data: {
        name: data.name,
        type: "grid",
        marketIndex: data.marketIndex,
        gridConfig: {
          lowerPrice: data.lowerPrice,
          upperPrice: data.upperPrice,
          gridLevels: data.gridLevels,
          amountPerGrid: data.amountPerGrid,
          mode: data.mode,
          orderType: data.orderType,
          limitPriceOffset: (data.orderType === "limit" || data.orderType === "post_only") ? (data.limitPriceOffset ?? 0) : 0,
          stopLoss: data.stopLoss || null,
          takeProfit: data.takeProfit || null,
        },
      },
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label>Nama Strategi</Label>
        <Input {...form.register("name")} placeholder="mis. BTC Grid Netral" className="bg-background" />
        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
      </div>

      <MarketPicker
        markets={markets}
        selectedMarket={selectedMarket}
        onSelect={(m) => { setSelectedMarket(m); form.setValue("marketIndex", m.index, { shouldValidate: true }); setAiResult(null); }}
        error={form.formState.errors.marketIndex?.message}
      />

      <Button
        type="button"
        variant="outline"
        className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-2"
        onClick={handleAIAnalyze}
        disabled={aiLoading || !selectedMarket}
      >
        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {aiLoading ? "Menganalisis pasar untuk setup grid..." : "Isi Otomatis Parameter Grid (AI)"}
      </Button>

      {aiResult && <AIInsightCard result={aiResult} />}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Harga Bawah</Label>
          <Input type="text" inputMode="decimal" {...form.register("lowerPrice")} placeholder="1800" className="bg-background font-mono" />
          {form.formState.errors.lowerPrice && <p className="text-xs text-destructive">{form.formState.errors.lowerPrice.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Harga Atas</Label>
          <Input type="text" inputMode="decimal" {...form.register("upperPrice")} placeholder="2200" className="bg-background font-mono" />
          {form.formState.errors.upperPrice && <p className="text-xs text-destructive">{form.formState.errors.upperPrice.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Level Grid</Label>
          <Input type="text" inputMode="numeric" {...form.register("gridLevels")} placeholder="10" className="bg-background font-mono" />
          {form.formState.errors.gridLevels && <p className="text-xs text-destructive">{form.formState.errors.gridLevels.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Jumlah per Grid (USDC)</Label>
          <Input type="text" inputMode="decimal" {...form.register("amountPerGrid")} placeholder="50" className="bg-background font-mono" />
          {form.formState.errors.amountPerGrid && <p className="text-xs text-destructive">{form.formState.errors.amountPerGrid.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Mode</Label>
          <Select onValueChange={(v: any) => form.setValue("mode", v)} value={form.watch("mode") || "neutral"}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="neutral">Netral (Keduanya)</SelectItem>
              <SelectItem value="long">Long (Beli saja)</SelectItem>
              <SelectItem value="short">Short (Jual saja)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipe Order</Label>
          <Select onValueChange={(v: any) => form.setValue("orderType", v)} value={form.watch("orderType") || "post_only"}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="post_only">Post-Only (Maker Only) ⭐⭐</SelectItem>
              <SelectItem value="limit">Limit (Maker/Taker) ⭐</SelectItem>
              <SelectItem value="market">Market (Taker)</SelectItem>
            </SelectContent>
          </Select>
          {form.watch("orderType") === "post_only" && (
            <p className="text-xs text-muted-foreground">Ditolak exchange jika langsung match — jaminan maker only, tidak ada taker fee.</p>
          )}
        </div>
      </div>

      {(watchOrderType === "limit" || watchOrderType === "post_only") && (
        <div className="space-y-2">
          <Label>
            Limit Price Offset (USDC)
            <span className="ml-1.5 text-xs text-muted-foreground">— offset dari harga pasar saat eksekusi</span>
          </Label>
          <Input type="text" inputMode="decimal" {...form.register("limitPriceOffset")} placeholder="e.g. 5" className="bg-background font-mono" />
          <p className="text-xs text-muted-foreground">
            Buy: order ditempatkan <strong>di bawah</strong> harga pasar. Sell: <strong>di atas</strong>. Set 0 untuk tepat di harga pasar.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Stop Loss <span className="text-xs text-muted-foreground">(opsional)</span></Label>
          <Input type="text" inputMode="decimal" {...form.register("stopLoss")} placeholder="mis. 1700" className="bg-background font-mono" />
          <p className="text-xs text-muted-foreground">Bot berhenti jika harga turun di bawah ini</p>
        </div>
        <div className="space-y-2">
          <Label>Take Profit <span className="text-xs text-muted-foreground">(opsional)</span></Label>
          <Input type="text" inputMode="decimal" {...form.register("takeProfit")} placeholder="mis. 2500" className="bg-background font-mono" />
          <p className="text-xs text-muted-foreground">Bot berhenti jika harga naik di atas ini</p>
        </div>
      </div>

      <div className="pt-4 flex justify-end gap-3 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={createMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white">
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Buat Bot Lighter
        </Button>
      </div>
    </form>
  );
}

export function CreateStrategyModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"dca" | "grid">("dca");
  const { data: marketsData } = useGetOrderBooks();
  const markets = marketsData?.markets ?? [];

  const handleSuccess = () => {
    setOpen(false);
    setTab("dca");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="text-white shadow-lg gap-2" style={{ background: "linear-gradient(135deg, #0fd4aa 0%, #0aaa88 100%)" }}>
          <Plus className="w-4 h-4" />
          Strategi Baru
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto bg-card border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExchangeLogo exchange="lighter" size={20} />
            Strategi Baru — Lighter DEX
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dca">DCA</TabsTrigger>
            <TabsTrigger value="grid">Grid</TabsTrigger>
          </TabsList>

          <TabsContent value="dca">
            <DcaForm markets={markets} onSuccess={handleSuccess} onCancel={() => setOpen(false)} />
          </TabsContent>

          <TabsContent value="grid">
            <GridForm markets={markets} onSuccess={handleSuccess} onCancel={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
