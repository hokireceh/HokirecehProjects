import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useUpdateStrategy, getGetStrategiesQueryKey } from "@workspace/api-client-react";
import { Loader2, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const dcaEditSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
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

const gridEditSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
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

type DcaEditData = z.infer<typeof dcaEditSchema>;
type GridEditData = z.infer<typeof gridEditSchema>;

interface Strategy {
  id: number;
  name: string;
  type: string;
  marketIndex?: number;
  marketSymbol: string;
  isRunning: boolean;
  dcaConfig?: any;
  gridConfig?: any;
}

interface EditStrategyModalProps {
  strategy: Strategy | null;
  onClose: () => void;
}

interface AIResult {
  reasoning: string;
  marketCondition: "bullish" | "bearish" | "sideways" | "volatile";
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  modelUsed: string;
  modelTier: string;
}

function sanitizeAINumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
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
      <div className="flex items-center justify-between flex-wrap gap-2">
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

function DcaEditForm({ strategy, onClose }: { strategy: Strategy; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cfg = strategy.dcaConfig ?? {};
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);

  const form = useForm<DcaEditData>({
    resolver: zodResolver(dcaEditSchema),
    defaultValues: {
      name: strategy.name,
      amountPerOrder: cfg.amountPerOrder ?? "",
      intervalMinutes: cfg.intervalMinutes ?? "",
      side: cfg.side ?? "buy",
      orderType: cfg.orderType ?? "market",
      limitPriceOffset: cfg.limitPriceOffset ?? 0,
    },
  });

  const watchOrderType = form.watch("orderType");
  const watchSide = form.watch("side");

  const updateMutation = useUpdateStrategy({
    mutation: {
      onSuccess: () => {
        toast({ title: "Strategi Diperbarui", description: "Perubahan berhasil disimpan." });
        queryClient.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Kesalahan", description: err.message || "Gagal memperbarui strategi", variant: "destructive" });
      },
    },
  });

  const handleAIAnalyze = async () => {
    const marketIndex = strategy.marketIndex;
    if (marketIndex === undefined || marketIndex === null) {
      toast({ title: "Indeks pasar tidak tersedia", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const data = await fetchAIAnalysis("dca", marketIndex);
      const rec = data.dca_params;
      if (!rec) throw new Error("AI tidak mengembalikan parameter DCA");
      if (rec.amountPerOrder) form.setValue("amountPerOrder", rec.amountPerOrder);
      if (rec.intervalMinutes) form.setValue("intervalMinutes", rec.intervalMinutes);
      if (rec.side) form.setValue("side", rec.side);
      if (rec.orderType) form.setValue("orderType", rec.orderType);
      if (rec.limitPriceOffset !== undefined) form.setValue("limitPriceOffset", rec.limitPriceOffset);
      setAiResult({ reasoning: data.reasoning, marketCondition: data.marketCondition, riskLevel: data.riskLevel, confidence: data.confidence, modelUsed: data.modelUsed, modelTier: data.modelTier });
      toast({ title: "Analisis AI Selesai", description: `Parameter diperbarui menggunakan ${data.modelTier}` });
    } catch (err: any) {
      toast({ title: "Analisis AI Gagal", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = (data: DcaEditData) => {
    updateMutation.mutate({
      id: strategy.id,
      data: {
        name: data.name,
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label>Nama Strategi</Label>
        <Input {...form.register("name")} className="bg-background" />
        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-2"
        onClick={handleAIAnalyze}
        disabled={aiLoading}
      >
        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {aiLoading ? "Menganalisis pasar..." : "Analisis Ulang AI & Perbarui Parameter"}
      </Button>

      {aiResult && <AIInsightCard result={aiResult} />}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Jumlah (USDC)</Label>
          <Input type="text" inputMode="decimal" {...form.register("amountPerOrder")} className="bg-background font-mono" />
          {form.formState.errors.amountPerOrder && <p className="text-xs text-destructive">{form.formState.errors.amountPerOrder.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Interval (Menit)</Label>
          <Input type="text" inputMode="numeric" {...form.register("intervalMinutes")} className="bg-background font-mono" />
          {form.formState.errors.intervalMinutes && <p className="text-xs text-destructive">{form.formState.errors.intervalMinutes.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Sisi</Label>
          <Select value={watchSide} onValueChange={(v: any) => form.setValue("side", v)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipe Order</Label>
          <Select value={watchOrderType} onValueChange={(v: any) => form.setValue("orderType", v)}>
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
            <span className="ml-1.5 text-xs text-muted-foreground">— offset dari harga pasar</span>
          </Label>
          <Input type="text" inputMode="decimal" {...form.register("limitPriceOffset")} className="bg-background font-mono" />
          <p className="text-xs text-muted-foreground">
            Beli: order di <strong>bawah</strong> harga pasar. Jual: di <strong>atas</strong>.
          </p>
        </div>
      )}

      <div className="pt-4 flex justify-end gap-3 border-t border-border">
        <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Simpan Perubahan
        </Button>
      </div>
    </form>
  );
}

function GridEditForm({ strategy, onClose }: { strategy: Strategy; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cfg = strategy.gridConfig ?? {};
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);

  const form = useForm<GridEditData>({
    resolver: zodResolver(gridEditSchema),
    defaultValues: {
      name: strategy.name,
      lowerPrice: cfg.lowerPrice ?? "",
      upperPrice: cfg.upperPrice ?? "",
      gridLevels: cfg.gridLevels ?? "",
      amountPerGrid: cfg.amountPerGrid ?? "",
      mode: cfg.mode ?? "neutral",
      orderType: cfg.orderType ?? "limit",
      limitPriceOffset: cfg.limitPriceOffset ?? 0,
      stopLoss: cfg.stopLoss ?? undefined,
      takeProfit: cfg.takeProfit ?? undefined,
    },
  });

  const watchOrderType = form.watch("orderType");
  const watchMode = form.watch("mode");

  const updateMutation = useUpdateStrategy({
    mutation: {
      onSuccess: () => {
        toast({ title: "Strategi Diperbarui", description: "Perubahan berhasil disimpan." });
        queryClient.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Kesalahan", description: err.message || "Gagal memperbarui strategi", variant: "destructive" });
      },
    },
  });

  const handleAIAnalyze = async () => {
    const marketIndex = strategy.marketIndex;
    if (marketIndex === undefined || marketIndex === null) {
      toast({ title: "Indeks pasar tidak tersedia", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const data = await fetchAIAnalysis("grid", marketIndex);
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
      const aiLower = lowerPrice ?? form.getValues("lowerPrice") ?? 0;
      const aiUpper = upperPrice ?? form.getValues("upperPrice") ?? 0;
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
      toast({ title: "Analisis AI Selesai", description: `Parameter grid diperbarui menggunakan ${data.modelTier}` });
    } catch (err: any) {
      toast({ title: "Analisis AI Gagal", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = (data: GridEditData) => {
    updateMutation.mutate({
      id: strategy.id,
      data: {
        name: data.name,
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label>Nama Strategi</Label>
        <Input {...form.register("name")} className="bg-background" />
        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-2"
        onClick={handleAIAnalyze}
        disabled={aiLoading}
      >
        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {aiLoading ? "Menganalisis pasar untuk setup grid..." : "Analisis Ulang AI & Perbarui Parameter Grid"}
      </Button>

      {aiResult && <AIInsightCard result={aiResult} />}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Harga Bawah</Label>
          <Input type="text" inputMode="decimal" {...form.register("lowerPrice")} className="bg-background font-mono" />
          {form.formState.errors.lowerPrice && <p className="text-xs text-destructive">{form.formState.errors.lowerPrice.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Harga Atas</Label>
          <Input type="text" inputMode="decimal" {...form.register("upperPrice")} className="bg-background font-mono" />
          {form.formState.errors.upperPrice && <p className="text-xs text-destructive">{form.formState.errors.upperPrice.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Level Grid</Label>
          <Input type="text" inputMode="numeric" {...form.register("gridLevels")} className="bg-background font-mono" />
          {form.formState.errors.gridLevels && <p className="text-xs text-destructive">{form.formState.errors.gridLevels.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Jumlah per Grid (USDC)</Label>
          <Input type="text" inputMode="decimal" {...form.register("amountPerGrid")} className="bg-background font-mono" />
          {form.formState.errors.amountPerGrid && <p className="text-xs text-destructive">{form.formState.errors.amountPerGrid.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Mode</Label>
          <Select value={watchMode} onValueChange={(v: any) => form.setValue("mode", v)}>
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
          <Select value={watchOrderType} onValueChange={(v: any) => form.setValue("orderType", v)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="post_only">Post-Only (Maker Only) ⭐⭐</SelectItem>
              <SelectItem value="limit">Limit (Maker/Taker) ⭐</SelectItem>
              <SelectItem value="market">Market (Taker)</SelectItem>
            </SelectContent>
          </Select>
          {watchOrderType === "post_only" && (
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
          <Input type="text" inputMode="decimal" {...form.register("limitPriceOffset")} className="bg-background font-mono" />
          <p className="text-xs text-muted-foreground">
            Buy: order di <strong>bawah</strong> harga pasar. Sell: di <strong>atas</strong> harga pasar. Set 0 untuk tepat di harga pasar.
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
        <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Simpan Perubahan
        </Button>
      </div>
    </form>
  );
}

export function EditStrategyModal({ strategy, onClose }: EditStrategyModalProps) {
  return (
    <Dialog open={!!strategy} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto bg-card border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Edit Strategi
            {strategy && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {strategy.marketSymbol} {strategy.type.toUpperCase()}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {strategy?.type === "dca" && (
          <DcaEditForm strategy={strategy} onClose={onClose} />
        )}
        {strategy?.type === "grid" && (
          <GridEditForm strategy={strategy} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
