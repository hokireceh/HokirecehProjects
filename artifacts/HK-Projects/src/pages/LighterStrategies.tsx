import { useState } from "react";
import { 
  useGetStrategies, 
  useStartBot, 
  useStopBot,
  useDeleteStrategy,
  useGetPnlChart,
  useGetAccountInfo,
  getGetStrategiesQueryKey,
  getGetPnlChartQueryKey,
  type DcaConfig,
  type GridConfig,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Activity, BarChart2, Zap, LineChart, Pencil, Wallet, ScrollText } from "lucide-react";
import { CreateStrategyModal } from "@/components/strategies/CreateStrategyModal";
import { EditStrategyModal } from "@/components/strategies/EditStrategyModal";
import { LighterLogDialog } from "@/components/lighter/LighterLogDialog";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";
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

function PnlChartDialog({ strategyId, strategyName, open, onClose }: {
  strategyId: number;
  strategyName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useGetPnlChart({ strategyId }, { query: { queryKey: getGetPnlChartQueryKey({ strategyId }), enabled: open } });

  const chartData = data?.data ?? [];
  const hasData = chartData.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[700px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-primary" />
            Grafik PnL — {strategyName}
          </DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          {isLoading ? (
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
                    {chartData.reduce((a, d) => a + d.buys, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Beli</p>
                </div>
                <div className="bg-background rounded-lg p-3 border border-border/50">
                  <p className="text-2xl font-bold font-mono text-destructive">
                    {chartData.reduce((a, d) => a + d.sells, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Jual</p>
                </div>
                <div className="bg-background rounded-lg p-3 border border-border/50">
                  <p className={`text-2xl font-bold font-mono ${(chartData[chartData.length - 1]?.cumulativePnl ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                    ${(chartData[chartData.length - 1]?.cumulativePnl ?? 0).toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">PnL Kumulatif</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ReLineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number, name: string) => [`$${v.toFixed(4)}`, name]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="estimatedPnl" stroke="#10b981" strokeWidth={2} dot={false} name="PnL Harian" />
                  <Line type="monotone" dataKey="cumulativePnl" stroke="#6366f1" strokeWidth={2} dot={false} name="PnL Kumulatif" />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Strategies() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetStrategies({ query: { queryKey: getGetStrategiesQueryKey(), refetchInterval: 5000 } });
  const { data: account } = useGetAccountInfo();
  const [chartStrategy, setChartStrategy] = useState<{ id: number; name: string } | null>(null);
  const [editStrategy, setEditStrategy] = useState<any | null>(null);
  const [logStrategyId, setLogStrategyId] = useState<number | null>(null);
  const logStrategy = data?.strategies.find((s) => s.id === logStrategyId);

  const isConfigured = account?.isConfigured ?? false;
  
  const startMutation = useStartBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot Dimulai", description: "Strategi sedang berjalan." });
        queryClient.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "Gagal memulai bot.";
        toast({ title: "Tidak Dapat Memulai Bot", description: msg, variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
      },
    }
  });

  const stopMutation = useStopBot({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bot Dihentikan", description: "Strategi telah dijeda." });
        queryClient.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "Gagal menghentikan bot.";
        toast({ title: "Tidak Dapat Menghentikan Bot", description: msg, variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
      },
    }
  });

  const deleteMutation = useDeleteStrategy({
    mutation: {
      onSuccess: () => {
        toast({ title: "Strategi Dihapus" });
        queryClient.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
      }
    }
  });

  const handleToggle = (strategyId: number, isRunning: boolean) => {
    if (isRunning) {
      stopMutation.mutate({ strategyId });
    } else {
      startMutation.mutate({ strategyId });
    }
  };

  const handleDelete = (strategyId: number) => {
    if (confirm("Yakin ingin menghapus strategi ini?")) {
      deleteMutation.mutate({ id: strategyId });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <ExchangeLogo exchange="lighter" size={32} className="rounded-lg" />
            Strategi Lighter
          </h1>
          <p className="text-muted-foreground mt-1">Bot trading otomatis di Lighter DEX</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Lighter Account Balance Widget */}
          {isConfigured && account?.totalEquity != null ? (
            <div className="flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1.5 rounded-lg">
              <Wallet className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs text-muted-foreground">USDC:</span>
              <span className="font-mono font-bold text-teal-300">
                ${account.totalEquity.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="w-4 h-4" />
              <span>Belum terkonfigurasi</span>
            </div>
          )}
          <CreateStrategyModal />
        </div>
      </header>

      {/* Status badge */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm w-fit ${
        isConfigured
          ? "bg-teal-500/5 border-teal-500/20"
          : "bg-muted border-border"
      }`}>
        <ExchangeLogo exchange="lighter" size={14} />
        <span className="text-teal-300 font-medium">Lighter DEX</span>
        {isConfigured ? (
          <span className="text-green-400 font-medium">aktif ✓</span>
        ) : (
          <span className="text-yellow-400 font-medium">belum dikonfigurasi</span>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
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
                <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="h-12 bg-muted/50 animate-pulse rounded-lg" />
                  <div className="h-12 bg-muted/50 animate-pulse rounded-lg" />
                </div>
              </CardContent>
              <CardFooter className="flex gap-2 pt-3 border-t border-border/50">
                <div className="h-8 flex-1 bg-muted animate-pulse rounded" />
                <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                <div className="h-8 w-8 bg-muted animate-pulse rounded" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : !data?.strategies.length ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border flex flex-col items-center">
          <Zap className="w-16 h-16 text-teal-400 mb-4 opacity-20" />
          <h3 className="text-xl font-bold text-foreground">Belum Ada Strategi Lighter</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Kamu belum membuat bot Lighter. Klik "Strategi Baru" untuk membuat DCA atau Grid bot di Lighter DEX.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.strategies.map(strategy => (
            <Card key={strategy.id} className="glass-panel flex flex-col overflow-hidden relative group">
              {strategy.isRunning && (
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-success/50 via-success to-success/50 animate-pulse" />
              )}
              
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      {strategy.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                        {strategy.marketSymbol}
                      </span>
                      <span className="text-xs uppercase font-bold text-primary tracking-wider">
                        {strategy.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Lighter
                      </span>
                    </div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    strategy.isRunning ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                  }`}>
                    {strategy.isRunning && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
                    {strategy.isRunning ? 'Berjalan' : 'Berhenti'}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="py-4 flex-1">
                {strategy.type === 'dca' && strategy.dcaConfig && (() => {
                  const dca = strategy.dcaConfig as DcaConfig;
                  return (
                    <div className="grid grid-cols-2 gap-y-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Jumlah</div>
                        <div className="font-mono">${dca.amountPerOrder}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Interval</div>
                        <div className="font-mono">{dca.intervalMinutes}m</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Sisi</div>
                        <div className={`font-medium ${dca.side === 'buy' ? 'text-success' : 'text-destructive'}`}>
                          {dca.side.toUpperCase()}
                        </div>
                      </div>
                      {dca.orderType && (
                        <div>
                          <div className="text-muted-foreground text-xs">Order Type</div>
                          <div className="font-mono text-xs capitalize">{dca.orderType}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {strategy.type === 'grid' && strategy.gridConfig && (() => {
                  const grid = strategy.gridConfig as GridConfig;
                  return (
                    <div className="grid grid-cols-2 gap-y-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Rentang</div>
                        <div className="font-mono text-xs">${grid.lowerPrice} - ${grid.upperPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Level</div>
                        <div className="font-mono">{grid.gridLevels}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Per Grid</div>
                        <div className="font-mono">${grid.amountPerGrid}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Mode</div>
                        <div className="font-mono capitalize">{grid.mode}</div>
                      </div>
                      {grid.stopLoss && (
                        <div>
                          <div className="text-muted-foreground text-xs">Stop Loss</div>
                          <div className="font-mono text-destructive">${grid.stopLoss}</div>
                        </div>
                      )}
                      {grid.takeProfit && (
                        <div>
                          <div className="text-muted-foreground text-xs">Take Profit</div>
                          <div className="font-mono text-success">${grid.takeProfit}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {strategy.stats && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><BarChart2 className="w-3 h-3" /> PnL Terealisasi</span>
                      <PriceDisplay value={strategy.stats.realizedPnl} format="currency" showIcon />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Trade: {strategy.stats.successfulOrders} / {strategy.stats.totalOrders}
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-3 pb-4 border-t border-border/50 bg-background/50 flex justify-between gap-2">
                <Button 
                  variant={strategy.isRunning ? "destructive" : "default"} 
                  className={`flex-1 ${!strategy.isRunning && 'bg-success hover:bg-success/90 text-success-foreground'}`}
                  onClick={() => handleToggle(strategy.id, strategy.isRunning)}
                  disabled={startMutation.isPending || stopMutation.isPending}
                >
                  {strategy.isRunning ? <><Square className="w-4 h-4 mr-2 fill-current" /> Hentikan Bot</> : <><Play className="w-4 h-4 mr-2 fill-current" /> Mulai Bot</>}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                  title="Lihat Grafik PnL"
                  onClick={() => setChartStrategy({ id: strategy.id, name: strategy.name })}
                >
                  <Activity className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 hover:bg-teal-500/10 hover:text-teal-400 hover:border-teal-500/30"
                  title="Lihat Log"
                  onClick={() => setLogStrategyId(strategy.id)}
                >
                  <ScrollText className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30"
                  title="Edit Strategi"
                  onClick={() => setEditStrategy(strategy)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="shrink-0 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30" onClick={() => handleDelete(strategy.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {chartStrategy && (
        <PnlChartDialog
          strategyId={chartStrategy.id}
          strategyName={chartStrategy.name}
          open={!!chartStrategy}
          onClose={() => setChartStrategy(null)}
        />
      )}

      <EditStrategyModal
        strategy={editStrategy}
        onClose={() => setEditStrategy(null)}
      />

      {logStrategy && (
        <LighterLogDialog
          strategyId={logStrategy.id}
          strategyName={logStrategy.name}
          open={true}
          onClose={() => setLogStrategyId(null)}
        />
      )}
    </div>
  );
}
