import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Activity, BarChart2, Zap, LineChart, Pencil } from "lucide-react";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";
import { ExtCreateStrategyModal } from "@/components/extended/ExtCreateStrategyModal";
import { ExtEditStrategyModal } from "@/components/extended/ExtEditStrategyModal";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExtStrategy {
  id: number;
  name: string;
  type: "dca" | "grid";
  exchange: string;
  marketSymbol: string;
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
  nextRunAtLive: string | null;
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

interface PnlDataPoint {
  date: string;
  buys: number;
  sells: number;
  estimatedPnl: number;
  cumulativePnl: number;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api/extended/strategies${path}`, {
    credentials: "include",
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ── PnL Chart Dialog ───────────────────────────────────────────────────────────

function ExtPnlChartDialog({
  strategyId,
  strategyName,
  open,
  onClose,
}: {
  strategyId: number;
  strategyName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<PnlDataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch(`/pnl-chart/data?strategyId=${strategyId}`)
      .then((res) => setData(res.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [open, strategyId]);

  const hasData = data.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[700px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-violet-400" />
            Grafik PnL Extended — {strategyName}
          </DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          {loading ? (
            <div className="h-64 bg-muted animate-pulse rounded-lg" />
          ) : !hasData ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
              <BarChart2 className="w-12 h-12 mb-3 opacity-20" />
              <p>Belum ada data trade. Mulai bot untuk mulai melacak PnL.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-background rounded-lg p-3 border border-border/50">
                  <p className="text-2xl font-bold font-mono text-success">
                    {data.reduce((a, d) => a + d.buys, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Beli</p>
                </div>
                <div className="bg-background rounded-lg p-3 border border-border/50">
                  <p className="text-2xl font-bold font-mono text-destructive">
                    {data.reduce((a, d) => a + d.sells, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Jual</p>
                </div>
                <div className="bg-background rounded-lg p-3 border border-border/50">
                  <p className={`text-2xl font-bold font-mono ${
                    (data[data.length - 1]?.cumulativePnl ?? 0) >= 0 ? "text-success" : "text-destructive"
                  }`}>
                    ${(data[data.length - 1]?.cumulativePnl ?? 0).toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">PnL Kumulatif</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ReLineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    formatter={(v: number, name: string) => [`$${v.toFixed(4)}`, name]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="estimatedPnl" stroke="#10b981" strokeWidth={2} dot={false} name="PnL Harian" />
                  <Line type="monotone" dataKey="cumulativePnl" stroke="#a78bfa" strokeWidth={2} dot={false} name="PnL Kumulatif" />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Strategy Card ──────────────────────────────────────────────────────────────

function ExtStrategyCard({
  strategy,
  onToggle,
  onDelete,
  onShowChart,
  onEdit,
  isBusy,
}: {
  strategy: ExtStrategy;
  onToggle: () => void;
  onDelete: () => void;
  onShowChart: () => void;
  onEdit: () => void;
  isBusy: boolean;
}) {
  const pnl = parseFloat(strategy.realizedPnl ?? "0");

  return (
    <Card className="glass-panel flex flex-col overflow-hidden relative group">
      {strategy.isRunning && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500/50 via-violet-400 to-violet-500/50 animate-pulse" />
      )}

      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-bold">{strategy.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-mono bg-violet-500/10 text-violet-300 px-2 py-0.5 rounded border border-violet-500/20">
                {strategy.marketSymbol}
              </span>
              <span className="text-xs uppercase font-bold text-violet-400 tracking-wider">
                {strategy.type}
              </span>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Extended
              </span>
            </div>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            strategy.isRunning ? "bg-violet-500/20 text-violet-300" : "bg-muted text-muted-foreground"
          }`}>
            {strategy.isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            )}
            {strategy.isRunning ? "Berjalan" : "Berhenti"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-4 flex-1">
        {strategy.type === "dca" && strategy.dcaConfig && (
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Jumlah</div>
              <div className="font-mono">${strategy.dcaConfig.amountPerOrder}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Interval</div>
              <div className="font-mono">{strategy.dcaConfig.intervalMinutes}m</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Sisi</div>
              <div className={`font-medium ${strategy.dcaConfig.side === "buy" ? "text-success" : "text-destructive"}`}>
                {strategy.dcaConfig.side.toUpperCase()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Order Type</div>
              <div className="font-mono text-xs capitalize">{strategy.dcaConfig.orderType}</div>
            </div>
          </div>
        )}

        {strategy.type === "grid" && strategy.gridConfig && (
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Rentang</div>
              <div className="font-mono text-xs">
                ${strategy.gridConfig.lowerPrice} – ${strategy.gridConfig.upperPrice}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Level</div>
              <div className="font-mono">{strategy.gridConfig.gridLevels}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Per Grid</div>
              <div className="font-mono">${strategy.gridConfig.amountPerGrid}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Mode</div>
              <div className="font-mono capitalize">{strategy.gridConfig.mode}</div>
            </div>
            {strategy.gridConfig.stopLoss && (
              <div>
                <div className="text-muted-foreground text-xs">Stop Loss</div>
                <div className="font-mono text-destructive">${strategy.gridConfig.stopLoss}</div>
              </div>
            )}
            {strategy.gridConfig.takeProfit && (
              <div>
                <div className="text-muted-foreground text-xs">Take Profit</div>
                <div className="font-mono text-success">${strategy.gridConfig.takeProfit}</div>
              </div>
            )}
          </div>
        )}

        {(strategy.totalOrders > 0 || pnl !== 0) && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> PnL Terealisasi
              </span>
              <PriceDisplay value={pnl} format="currency" showIcon />
            </div>
            <div className="text-xs text-muted-foreground">
              Trade: {strategy.successfulOrders} / {strategy.totalOrders}
            </div>
          </div>
        )}

        {strategy.type === "dca" && strategy.isRunning && strategy.nextRunAtLive && (
          <div className="mt-2 text-xs text-muted-foreground">
            Eksekusi berikutnya:{" "}
            <span className="font-mono text-violet-400">
              {new Date(strategy.nextRunAtLive).toLocaleTimeString("id-ID")}
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 pb-4 border-t border-border/50 bg-background/50 flex justify-between gap-2">
        <Button
          variant={strategy.isRunning ? "destructive" : "default"}
          className={`flex-1 ${!strategy.isRunning ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}`}
          onClick={onToggle}
          disabled={isBusy}
        >
          {strategy.isRunning ? (
            <><Square className="w-4 h-4 mr-2 fill-current" /> Hentikan Bot</>
          ) : (
            <><Play className="w-4 h-4 mr-2 fill-current" /> Mulai Bot</>
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30"
          title="Lihat Grafik PnL"
          onClick={onShowChart}
        >
          <Activity className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30"
          title="Edit strategi"
          disabled={strategy.isRunning}
          onClick={onEdit}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          title="Hapus strategi"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ExtendedStrategies() {
  const { toast } = useToast();
  const [strategies, setStrategies] = useState<ExtStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [chartStrategy, setChartStrategy] = useState<{ id: number; name: string } | null>(null);
  const [editStrategy, setEditStrategy] = useState<ExtStrategy | null>(null);

  const fetchStrategies = useCallback(async () => {
    try {
      const data = await apiFetch("/");
      setStrategies(data.strategies ?? []);
    } catch {
      // silent — state tetap sama jika request gagal sementara
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
    const id = setInterval(fetchStrategies, 5000);
    return () => clearInterval(id);
  }, [fetchStrategies]);

  const setBusy = (id: number, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      busy ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleToggle = async (strategy: ExtStrategy) => {
    setBusy(strategy.id, true);
    try {
      if (strategy.isRunning) {
        await apiFetch(`/stop/${strategy.id}`, { method: "POST" });
        toast({ title: "Bot Extended Dihentikan", description: strategy.name });
      } else {
        await apiFetch(`/start/${strategy.id}`, { method: "POST" });
        toast({ title: "Bot Extended Dimulai", description: strategy.name });
      }
      fetchStrategies();
    } catch (err: any) {
      toast({
        title: strategy.isRunning ? "Gagal Menghentikan Bot" : "Gagal Memulai Bot",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setBusy(strategy.id, false);
    }
  };

  const handleDelete = async (strategy: ExtStrategy) => {
    if (!confirm(`Yakin ingin menghapus strategi "${strategy.name}"?`)) return;
    setBusy(strategy.id, true);
    try {
      await apiFetch(`/${strategy.id}`, { method: "DELETE" });
      toast({ title: "Strategi Extended Dihapus" });
      fetchStrategies();
    } catch (err: any) {
      toast({ title: "Gagal Menghapus", description: err.message, variant: "destructive" });
    } finally {
      setBusy(strategy.id, false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <ExchangeLogo exchange="extended" size={32} className="rounded-lg" />
            Strategi Extended
          </h1>
          <p className="text-muted-foreground mt-1">
            Bot trading otomatis di Extended DEX
          </p>
        </div>
        <ExtCreateStrategyModal onCreated={fetchStrategies} />
      </header>

      {/* Info badge Extended DEX */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/5 border border-violet-500/20 text-sm w-fit">
        <ExchangeLogo exchange="extended" size={14} />
        <span className="text-violet-300 font-medium">Extended DEX</span>
        <span className="text-green-400 font-medium">aktif ✓</span>
      </div>

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
      ) : !strategies.length ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border flex flex-col items-center">
          <Zap className="w-16 h-16 text-violet-400 mb-4 opacity-20" />
          <h3 className="text-xl font-bold text-foreground">Belum Ada Strategi Extended</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Kamu belum membuat bot Extended. Klik "Strategi Extended Baru" untuk membuat DCA atau Grid bot di Extended DEX.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {strategies.map((strategy) => (
            <ExtStrategyCard
              key={strategy.id}
              strategy={strategy}
              onToggle={() => handleToggle(strategy)}
              onDelete={() => handleDelete(strategy)}
              onShowChart={() => setChartStrategy({ id: strategy.id, name: strategy.name })}
              onEdit={() => setEditStrategy(strategy)}
              isBusy={busyIds.has(strategy.id)}
            />
          ))}
        </div>
      )}

      {chartStrategy && (
        <ExtPnlChartDialog
          strategyId={chartStrategy.id}
          strategyName={chartStrategy.name}
          open={!!chartStrategy}
          onClose={() => setChartStrategy(null)}
        />
      )}

      <ExtEditStrategyModal
        strategy={editStrategy}
        onClose={() => {
          setEditStrategy(null);
          fetchStrategies();
        }}
      />
    </div>
  );
}
