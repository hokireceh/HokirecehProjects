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
import { Plus, Loader2, ChevronsUpDown, Check, Sparkles } from "lucide-react";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";

// ── Tipe market dari API ────────────────────────────────────────────────────────
interface ExtMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  markPrice: number;
}

// ── Fetch market dari API Extended (bukan hardcode) ────────────────────────────
async function fetchExtendedMarkets(): Promise<ExtMarket[]> {
  const res = await fetch("/api/extended/strategies/markets", { credentials: "include" });
  if (!res.ok) throw new Error("Gagal memuat daftar market");
  const json = await res.json();
  return json.markets ?? [];
}

// ── Zod schema DCA ─────────────────────────────────────────────────────────────

const extDcaSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  marketSymbol: z.string().min(1, "Pilih market terlebih dahulu"),
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
  z.number().positive("Harus angka positif").optional()
);

const extGridSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  marketSymbol: z.string().min(1, "Pilih market terlebih dahulu"),
  lowerPrice: z.coerce.number().positive("Harga bawah harus positif"),
  upperPrice: z.coerce.number().positive("Harga atas harus positif"),
  gridLevels: z.coerce.number().min(2).max(100),
  amountPerGrid: z.coerce.number().positive("Jumlah harus positif"),
  mode: z.enum(["neutral", "long", "short"]),
  orderType: z.enum(["market", "limit", "post_only"]),
  limitPriceOffset: z.coerce.number().min(0).optional(),
  stopLoss: optionalPositiveNumber,
  takeProfit: optionalPositiveNumber,
}).refine(d => d.upperPrice > d.lowerPrice, {
  message: "Harga atas harus lebih besar dari harga bawah",
  path: ["upperPrice"],
}).refine(d => !d.stopLoss || d.stopLoss < d.lowerPrice, {
  message: "Stop Loss harus di bawah Harga Bawah",
  path: ["stopLoss"],
}).refine(d => !d.takeProfit || d.takeProfit > d.upperPrice, {
  message: "Take Profit harus di atas Harga Atas",
  path: ["takeProfit"],
});

type ExtDcaFormData = z.infer<typeof extDcaSchema>;
type ExtGridFormData = z.infer<typeof extGridSchema>;

// ── Market Picker (dinamis dari API) ───────────────────────────────────────────

function ExtMarketPicker({
  selected,
  onSelect,
  error,
  markets,
  isLoading,
}: {
  selected: string | null;
  onSelect: (symbol: string) => void;
  error?: string;
  markets: ExtMarket[];
  isLoading: boolean;
}) {
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
            disabled={isLoading}
            className="w-full justify-between bg-background font-normal"
          >
            {isLoading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Memuat market...
              </span>
            ) : selected ? (
              <span className="font-mono text-sm">{selected}</span>
            ) : (
              <span className="text-muted-foreground">Pilih market (mis. ETH-USD)...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 z-[200]" align="start">
          <Command>
            <CommandInput placeholder="Cari market (mis. HYPE, ETH, BTC)..." />
            <CommandList className="max-h-[280px] overflow-y-auto">
              <CommandEmpty>Market tidak ditemukan.</CommandEmpty>
              <CommandGroup heading={`${markets.length} market tersedia`}>
                {markets.map(m => (
                  <CommandItem
                    key={m.symbol}
                    value={`${m.symbol} ${m.baseAsset}`}
                    onSelect={() => {
                      onSelect(m.symbol);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", selected === m.symbol ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-sm">{m.symbol}</span>
                    {m.markPrice > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground font-mono">
                        ${m.markPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Sanitize AI numbers (guard against European decimal format) ──────────────
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

// ── API helpers ─────────────────────────────────────────────────────────────────

async function createExtendedStrategy(payload: object) {
  const res = await fetch("/api/extended/strategies/", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Gagal membuat strategi Extended");
  return json;
}

async function fetchAiParams(strategyType: "dca" | "grid", marketSymbol: string) {
  const res = await fetch("/api/ai/analyze", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ strategyType, marketSymbol }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Gagal mengambil rekomendasi AI");
  return json;
}

// ── Tombol AI ─────────────────────────────────────────────────────────────────

function AiAutoFillButton({
  marketSymbol,
  strategyType,
  onResult,
  disabled,
}: {
  marketSymbol: string | null;
  strategyType: "dca" | "grid";
  onResult: (data: any) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!marketSymbol) {
      toast({ title: "Pilih market dulu", description: "Pilih market Extended sebelum menggunakan AI.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await fetchAiParams(strategyType, marketSymbol);
      onResult(data);
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
      size="sm"
      onClick={handleClick}
      disabled={disabled || loading || !marketSymbol}
      className="w-full gap-2 border-violet-500/30 text-violet-300 hover:bg-violet-500/10 hover:text-violet-200 hover:border-violet-500/50"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Sparkles className="w-3.5 h-3.5" />}
      {loading ? "Menganalisis pasar..." : "Isi Otomatis Parameter (AI)"}
    </Button>
  );
}

// ── DCA Form ───────────────────────────────────────────────────────────────────

function ExtDcaForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: markets = [], isLoading: marketsLoading } = useQuery({
    queryKey: ["extended-markets"],
    queryFn: fetchExtendedMarkets,
    staleTime: 60_000,
    retry: 2,
  });

  const form = useForm<ExtDcaFormData>({
    resolver: zodResolver(extDcaSchema),
    defaultValues: { side: "buy", orderType: "limit", limitPriceOffset: 0 },
  });

  const watchOrderType = form.watch("orderType");

  const handleAiResult = (data: any) => {
    const p = data?.dca_params;
    if (!p) return;
    if (p.amountPerOrder != null) form.setValue("amountPerOrder", p.amountPerOrder, { shouldValidate: true });
    if (p.intervalMinutes != null) form.setValue("intervalMinutes", p.intervalMinutes, { shouldValidate: true });
    if (p.side) form.setValue("side", p.side, { shouldValidate: true });
    if (p.orderType) form.setValue("orderType", p.orderType, { shouldValidate: true });
    if (p.limitPriceOffset != null) form.setValue("limitPriceOffset", p.limitPriceOffset, { shouldValidate: true });
  };

  const onSubmit = async (data: ExtDcaFormData) => {
    setLoading(true);
    try {
      await createExtendedStrategy({
        name: data.name,
        type: "dca",
        marketSymbol: data.marketSymbol,
        dcaConfig: {
          amountPerOrder: data.amountPerOrder,
          intervalMinutes: data.intervalMinutes,
          side: data.side,
          orderType: data.orderType,
          limitPriceOffset:
            data.orderType === "limit" || data.orderType === "post_only"
              ? (data.limitPriceOffset ?? 0)
              : 0,
        },
      });
      toast({ title: "Strategi Extended Dibuat", description: "Bot DCA Extended kamu siap." });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Kesalahan", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label>Nama Strategi</Label>
        <Input {...form.register("name")} placeholder="mis. ETH Akumulasi Harian" className="bg-background" />
        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
      </div>

      <ExtMarketPicker
        selected={selectedSymbol}
        onSelect={(sym) => {
          setSelectedSymbol(sym);
          form.setValue("marketSymbol", sym, { shouldValidate: true });
        }}
        error={form.formState.errors.marketSymbol?.message}
        markets={markets}
        isLoading={marketsLoading}
      />

      <AiAutoFillButton
        marketSymbol={selectedSymbol}
        strategyType="dca"
        onResult={handleAiResult}
        disabled={loading}
      />

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
              <SelectItem value="post_only">Post-Only (Maker) ⭐⭐</SelectItem>
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
        </div>
      )}

      <div className="pt-4 flex justify-end gap-3 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Buat Bot Extended
        </Button>
      </div>
    </form>
  );
}

// ── Grid Form ──────────────────────────────────────────────────────────────────

function ExtGridForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: markets = [], isLoading: marketsLoading } = useQuery({
    queryKey: ["extended-markets"],
    queryFn: fetchExtendedMarkets,
    staleTime: 60_000,
    retry: 2,
  });

  const form = useForm<ExtGridFormData>({
    resolver: zodResolver(extGridSchema),
    defaultValues: { mode: "neutral", orderType: "limit", limitPriceOffset: 0 },
  });

  const watchOrderType = form.watch("orderType");

  const handleAiResult = (data: any) => {
    const p = data?.grid_params;
    if (!p) return;
    const lowerPrice = sanitizeAINumber(p.lowerPrice);
    const upperPrice = sanitizeAINumber(p.upperPrice);
    const gridLevels = sanitizeAINumber(p.gridLevels);
    const amountPerGrid = sanitizeAINumber(p.amountPerGrid);
    const limitPriceOffset = sanitizeAINumber(p.limitPriceOffset);
    const stopLoss = sanitizeAINumber(p.stopLoss);
    const takeProfit = sanitizeAINumber(p.takeProfit);
    if (lowerPrice != null) form.setValue("lowerPrice", lowerPrice, { shouldValidate: true });
    if (upperPrice != null) form.setValue("upperPrice", upperPrice, { shouldValidate: true });
    if (gridLevels != null) form.setValue("gridLevels", gridLevels, { shouldValidate: true });
    if (amountPerGrid != null) form.setValue("amountPerGrid", amountPerGrid, { shouldValidate: true });
    if (p.mode) form.setValue("mode", p.mode, { shouldValidate: true });
    if (p.orderType) form.setValue("orderType", p.orderType, { shouldValidate: true });
    if (limitPriceOffset != null) form.setValue("limitPriceOffset", limitPriceOffset, { shouldValidate: true });

    const aiLower: number = lowerPrice ?? form.getValues("lowerPrice") ?? 0;
    const aiUpper: number = upperPrice ?? form.getValues("upperPrice") ?? 0;

    if (stopLoss != null && aiLower > 0) {
      const isReasonable = stopLoss < aiLower && stopLoss >= aiLower * 0.5;
      if (isReasonable) {
        form.setValue("stopLoss", stopLoss, { shouldValidate: true });
      } else {
        form.setValue("stopLoss", undefined as any, { shouldValidate: false });
      }
    } else {
      form.setValue("stopLoss", undefined as any, { shouldValidate: false });
    }
    if (takeProfit != null && aiUpper > 0) {
      const isReasonable = takeProfit > aiUpper && takeProfit <= aiUpper * 2;
      if (isReasonable) {
        form.setValue("takeProfit", takeProfit, { shouldValidate: true });
      } else {
        form.setValue("takeProfit", undefined as any, { shouldValidate: false });
      }
    } else {
      form.setValue("takeProfit", undefined as any, { shouldValidate: false });
    }
  };

  const onSubmit = async (data: ExtGridFormData) => {
    setLoading(true);
    try {
      await createExtendedStrategy({
        name: data.name,
        type: "grid",
        marketSymbol: data.marketSymbol,
        gridConfig: {
          lowerPrice: data.lowerPrice,
          upperPrice: data.upperPrice,
          gridLevels: data.gridLevels,
          amountPerGrid: data.amountPerGrid,
          mode: data.mode,
          orderType: data.orderType,
          limitPriceOffset:
            data.orderType === "limit" || data.orderType === "post_only"
              ? (data.limitPriceOffset ?? 0)
              : 0,
          stopLoss: data.stopLoss || null,
          takeProfit: data.takeProfit || null,
        },
      });
      toast({ title: "Strategi Extended Dibuat", description: "Bot Grid Extended kamu siap." });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Kesalahan", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label>Nama Strategi</Label>
        <Input {...form.register("name")} placeholder="mis. ETH Grid Netral" className="bg-background" />
        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
      </div>

      <ExtMarketPicker
        selected={selectedSymbol}
        onSelect={(sym) => {
          setSelectedSymbol(sym);
          form.setValue("marketSymbol", sym, { shouldValidate: true });
        }}
        error={form.formState.errors.marketSymbol?.message}
        markets={markets}
        isLoading={marketsLoading}
      />

      <AiAutoFillButton
        marketSymbol={selectedSymbol}
        strategyType="grid"
        onResult={handleAiResult}
        disabled={loading}
      />

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
              <SelectItem value="neutral">Netral (Beli &amp; Jual)</SelectItem>
              <SelectItem value="long">Long (Beli saja)</SelectItem>
              <SelectItem value="short">Short (Jual saja)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipe Order</Label>
          <Select onValueChange={(v: any) => form.setValue("orderType", v)} value={form.watch("orderType") || "limit"}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="post_only">Post-Only (Maker) ⭐⭐</SelectItem>
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
          <Input type="text" inputMode="decimal" {...form.register("limitPriceOffset")} placeholder="mis. 10" className="bg-background font-mono" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">Stop Loss (opsional)</Label>
          <Input type="text" inputMode="decimal" {...form.register("stopLoss")} placeholder="mis. 1700" className="bg-background font-mono" />
          {form.formState.errors.stopLoss && <p className="text-xs text-destructive">{form.formState.errors.stopLoss.message}</p>}
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground">Take Profit (opsional)</Label>
          <Input type="text" inputMode="decimal" {...form.register("takeProfit")} placeholder="mis. 2400" className="bg-background font-mono" />
          {form.formState.errors.takeProfit && <p className="text-xs text-destructive">{form.formState.errors.takeProfit.message}</p>}
        </div>
      </div>

      <div className="pt-4 flex justify-end gap-3 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>Batal</Button>
        <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Buat Bot Extended
        </Button>
      </div>
    </form>
  );
}

// ── Modal utama ────────────────────────────────────────────────────────────────

export function ExtCreateStrategyModal({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"dca" | "grid">("dca");
  const queryClient = useQueryClient();

  const handleSuccess = () => {
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["ext-strategies"] });
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          Strategi Extended Baru
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[580px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExchangeLogo exchange="extended" size={20} />
            Strategi Baru — Extended DEX
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dca">DCA</TabsTrigger>
            <TabsTrigger value="grid">Grid</TabsTrigger>
          </TabsList>
          <TabsContent value="dca">
            <ExtDcaForm onSuccess={handleSuccess} onCancel={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="grid">
            <ExtGridForm onSuccess={handleSuccess} onCancel={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
