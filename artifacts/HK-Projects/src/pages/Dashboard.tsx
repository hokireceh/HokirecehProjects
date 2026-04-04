import { useState, useEffect, useMemo } from "react";
import {
  useGetAccountInfo,
  useGetStrategies,
  useGetBotLogs,
  getGetBotLogsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import {
  Wallet, Activity, ArrowRightLeft, TrendingUp, AlertTriangle, Clock, Zap, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { formatWIBTime } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";

// ── Tipe Extended ─────────────────────────────────────────────────────────────

interface ExtStrategy { id: number; name: string; type: string; marketSymbol: string; isRunning: boolean; }

interface ExtAccountData {
  configured: boolean;
  network?: string;
  balance?: {
    equity: number;
    availableForTrade: number;
    unrealisedPnl: number;
    marginRatio: number;
    collateralName: string;
  } | null;
  positions?: Array<{
    id: number;
    market: string;
    side: "LONG" | "SHORT";
    size: string;
    openPrice: number;
    markPrice: number;
    unrealisedPnl: number;
    realisedPnl: number;
    leverage: string;
    liquidationPrice: number;
  }>;
}

interface UnifiedLog {
  key: string;
  exchange: "lighter" | "extended" | "ethereal";
  strategyName: string | null;
  level: string;
  message: string;
  details: string | null;
  createdAt: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useExtendedStrategies() {
  const [data, setData] = useState<ExtStrategy[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/extended/strategies", { credentials: "include" })
      .then(r => r.ok ? r.json() : { strategies: [] })
      .then(json => setData(json.strategies ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

function useExtendedAccount() {
  const [data, setData] = useState<ExtAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/extended/strategies/account", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(json => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

function useExtendedLogs(limit = 8) {
  const [data, setData] = useState<Array<{ id: number; strategyName: string | null; level: string; message: string; details: string | null; createdAt: string }> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    fetch(`/api/extended/strategies/logs/recent?limit=${limit}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(json => setData(json.logs ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [limit]);

  return { data, loading };
}

// ── Ethereal Hooks ────────────────────────────────────────────────────────────

function useEtherealStrategies() {
  const [data, setData] = useState<{ id: number; name: string; type: string; marketSymbol: string; isRunning: boolean }[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/ethereal/strategies", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(json => setData(Array.isArray(json) ? json : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

function useEtherealLogs(limit = 8) {
  const [data, setData] = useState<Array<{ id: number; strategyName: string | null; level: string; message: string; details: string | null; createdAt: string }> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    fetch(`/api/ethereal/strategies/logs/recent?limit=${limit}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(json => setData(json.logs ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [limit]);

  return { data, loading };
}

// ── Ethereal Section ──────────────────────────────────────────────────────────

function EtherealSection({
  strategies,
  loadingStrategies,
}: {
  strategies: { id: number; name: string; type: string; marketSymbol: string; isRunning: boolean }[] | null;
  loadingStrategies: boolean;
}) {
  const ethRunning = strategies?.filter(s => s.isRunning) ?? [];
  const ethTotal = strategies?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ExchangeLogo exchange="ethereal" size={18} />
        <h2 className="text-lg font-semibold text-foreground">Ethereal DEX</h2>
        <Link
          href="/ethereal"
          className="ml-auto text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
        >
          Kelola <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300 border-purple-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bot Ethereal Aktif</CardTitle>
            <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingStrategies ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold text-foreground font-mono">
                {ethRunning.length}{" "}
                <span className="text-muted-foreground text-sm font-sans font-normal">/ {ethTotal}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Strategi dikonfigurasi</p>
          </CardContent>
        </Card>

        {strategies && strategies.length > 0 && (
          <Card className="glass-panel border-purple-500/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Bot Berjalan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {strategies.filter(s => s.isRunning).map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="text-muted-foreground font-mono shrink-0">{s.marketSymbol}</span>
                  </div>
                ))}
                {ethRunning.length === 0 && (
                  <p className="text-xs text-muted-foreground">Tidak ada bot berjalan</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Subkomponen Extended Section (tanpa log) ──────────────────────────────────

function ExtendedSection({
  strategies,
  loadingStrategies,
  account,
  loadingAccount,
}: {
  strategies: ExtStrategy[] | null;
  loadingStrategies: boolean;
  account: ExtAccountData | null;
  loadingAccount: boolean;
}) {
  const extRunning = strategies?.filter(s => s.isRunning) ?? [];
  const extTotal = strategies?.length ?? 0;
  const notConfigured = !loadingAccount && account && !account.configured;
  const positions = account?.positions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ExchangeLogo exchange="extended" size={18} />
        <h2 className="text-lg font-semibold text-foreground">Extended DEX</h2>
        {account?.network && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono">
            {account.network}
          </span>
        )}
        <Link
          href="/extended"
          className="ml-auto text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
        >
          Kelola <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {notConfigured ? (
        <Card className="glass-panel border-violet-500/10">
          <CardContent className="py-6">
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
              <Zap className="w-8 h-8 text-violet-400 opacity-30" />
              <p className="text-sm">API Key Extended belum dikonfigurasi.</p>
              <Link href="/extended-config" className="text-violet-400 hover:underline text-sm">
                Konfigurasi sekarang →
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300 border-violet-500/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ekuitas Extended</CardTitle>
                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-violet-400" />
                </div>
              </CardHeader>
              <CardContent>
                {loadingAccount ? (
                  <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                ) : account?.balance ? (
                  <>
                    <PriceDisplay value={account.balance.equity} format="currency" colored={false} className="text-2xl font-bold text-foreground" />
                    <p className="text-xs text-muted-foreground mt-1">Tersedia: ${account.balance.availableForTrade.toFixed(2)}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300 border-violet-500/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Bot Extended Aktif</CardTitle>
                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-violet-400" />
                </div>
              </CardHeader>
              <CardContent>
                {loadingStrategies ? (
                  <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold text-foreground font-mono">
                    {extRunning.length}{" "}
                    <span className="text-muted-foreground text-sm font-sans font-normal">/ {extTotal}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Strategi dikonfigurasi</p>
              </CardContent>
            </Card>

            <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300 border-violet-500/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Posisi Extended</CardTitle>
                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4 text-violet-400" />
                </div>
              </CardHeader>
              <CardContent>
                {loadingAccount ? (
                  <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold text-foreground font-mono">{positions.length}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Posisi terbuka</p>
              </CardContent>
            </Card>

            <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300 border-violet-500/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">PnL Belum Terealisasi</CardTitle>
                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                </div>
              </CardHeader>
              <CardContent>
                {loadingAccount ? (
                  <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                ) : account?.balance ? (
                  <>
                    <PriceDisplay value={account.balance.unrealisedPnl} format="currency" showIcon className="text-2xl font-bold" />
                    {account.balance.marginRatio > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Margin ratio: {(account.balance.marginRatio * 100).toFixed(2)}%</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Posisi terbuka Extended */}
          <Card className="glass-panel border-violet-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExchangeLogo exchange="extended" size={14} />
                Posisi Terbuka Extended
              </CardTitle>
              <CardDescription>Eksposur risiko di Extended DEX</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAccount ? (
                <div className="space-y-4">
                  {[1, 2].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : positions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground flex flex-col items-center">
                  <AlertTriangle className="w-8 h-8 mb-2 opacity-20" />
                  <p>Tidak ada posisi terbuka di Extended.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {positions.map(pos => (
                    <div key={pos.id} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50 hover:border-violet-500/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`px-2 py-1 rounded text-xs font-bold ${pos.side === "LONG" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                          {pos.side}
                        </div>
                        <div>
                          <div className="font-bold text-foreground font-mono">{pos.market}</div>
                          <div className="text-xs text-muted-foreground font-mono">{pos.size} @ ${pos.openPrice.toLocaleString()} · {pos.leverage}x</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <PriceDisplay value={pos.unrealisedPnl} format="currency" showIcon />
                        <div className="text-xs text-muted-foreground font-mono">Mark: ${pos.markPrice.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Dashboard utama ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const { data: account, isLoading: loadingAccount } = useGetAccountInfo();
  const { data: strategiesData, isLoading: loadingStrategies } = useGetStrategies();
  const { data: logsData, isLoading: loadingLighterLogs } = useGetBotLogs({ limit: 8 }, { query: { queryKey: getGetBotLogsQueryKey({ limit: 8 }), refetchInterval: 5000 } });

  const { data: extStrategies, loading: loadingExtStrategies } = useExtendedStrategies();
  const { data: extAccount, loading: loadingExtAccount } = useExtendedAccount();
  const { data: extLogs, loading: loadingExtLogs } = useExtendedLogs(8);
  const { data: ethStrategies, loading: loadingEthStrategies } = useEtherealStrategies();
  const { data: ethLogs, loading: loadingEthLogs } = useEtherealLogs(8);

  const activeStrategies = strategiesData?.strategies?.filter(s => s.isActive) || [];
  const runningStrategies = strategiesData?.strategies?.filter(s => s.isRunning) || [];

  const expiresAt = user?.expiresAt ? new Date(user.expiresAt) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : null;
  const isExpiringSoon = daysLeft !== null && daysLeft <= 7;
  const isExpired = daysLeft !== null && daysLeft <= 0;

  // Gabungkan log Lighter + Extended + Ethereal, urutkan dari terbaru, ambil 10 teratas
  const loadingCombinedLogs = loadingLighterLogs || loadingExtLogs || loadingEthLogs;
  const combinedLogs = useMemo<UnifiedLog[]>(() => {
    const lighter: UnifiedLog[] = (logsData?.logs ?? [])
      .map((l, i) => ({
        key: `lighter-${l.id ?? i}`,
        exchange: "lighter" as const,
        strategyName: l.strategyName ?? null,
        level: l.level,
        message: l.message,
        details: l.details ?? null,
        createdAt: l.createdAt,
      }));
    const extended: UnifiedLog[] = (extLogs ?? []).map((l, i) => ({
      key: `extended-${l.id ?? i}`,
      exchange: "extended" as const,
      strategyName: l.strategyName ?? null,
      level: l.level,
      message: l.message,
      details: l.details ?? null,
      createdAt: l.createdAt,
    }));
    const ethereal: UnifiedLog[] = (ethLogs ?? []).map((l, i) => ({
      key: `ethereal-${l.id ?? i}`,
      exchange: "ethereal" as const,
      strategyName: l.strategyName ?? null,
      level: l.level,
      message: l.message,
      details: l.details ?? null,
      createdAt: l.createdAt,
    }));
    return [...lighter, ...extended, ...ethereal]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [logsData, extLogs, ethLogs]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">

      {/* ── Lighter Section ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ExchangeLogo exchange="lighter" size={18} />
          <h2 className="text-lg font-semibold text-foreground">Lighter DEX</h2>
          {account?.network && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
              {account.network}
            </span>
          )}
          <Link
            href="/lighter"
            className="ml-auto text-sm text-primary hover:text-primary/80 flex items-center gap-1"
          >
            Kelola <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Ekuitas</CardTitle>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingAccount ? (
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              ) : (
                <PriceDisplay value={account?.totalEquity || 0} format="currency" colored={false} className="text-2xl font-bold text-foreground" />
              )}
              <p className="text-xs text-muted-foreground mt-1">Tersedia: ${account?.availableBalance?.toFixed(2) || "0.00"}</p>
            </CardContent>
          </Card>

          <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Bot Aktif</CardTitle>
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-accent" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingStrategies ? (
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-2xl font-bold text-foreground font-mono">
                  {runningStrategies.length}{" "}
                  <span className="text-muted-foreground text-sm font-sans font-normal">/ {activeStrategies.length}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Strategi dikonfigurasi</p>
            </CardContent>
          </Card>

          <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Posisi Terbuka</CardTitle>
              <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                <ArrowRightLeft className="w-4 h-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingAccount ? (
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-2xl font-bold text-foreground font-mono">{account?.positions?.length || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Di semua pasar</p>
            </CardContent>
          </Card>

          <Card className="glass-panel hover:-translate-y-1 transition-transform duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">PnL Belum Terealisasi</CardTitle>
              <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-warning" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingAccount ? (
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              ) : (
                <PriceDisplay
                  value={account?.positions?.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0) || 0}
                  format="currency"
                  showIcon
                  className="text-2xl font-bold"
                />
              )}
              <p className="text-xs text-muted-foreground mt-1">Dari posisi terbuka</p>
            </CardContent>
          </Card>
        </div>

        {/* Posisi terbuka Lighter */}
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle>Posisi Terbuka</CardTitle>
            <CardDescription>Eksposur risiko saat ini di Lighter</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAccount ? (
              <div className="space-y-4">
                {[1, 2].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : !account?.positions?.length ? (
              <div className="text-center py-8 text-muted-foreground flex flex-col items-center">
                <AlertTriangle className="w-8 h-8 mb-2 opacity-20" />
                <p>Tidak ada posisi terbuka.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {account.positions.map((pos, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50 hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`px-2 py-1 rounded text-xs font-bold ${pos.side === "long" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                        {pos.side.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-foreground">{pos.marketSymbol}</div>
                        <div className="text-xs text-muted-foreground font-mono">{pos.size} @ ${pos.entryPrice}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <PriceDisplay value={pos.unrealizedPnl} format="currency" showIcon />
                      <div className="text-xs text-muted-foreground font-mono">Mark: ${pos.markPrice}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Extended Section ─────────────────────────────────────────────────── */}
      <section>
        <ExtendedSection
          strategies={extStrategies}
          loadingStrategies={loadingExtStrategies}
          account={extAccount}
          loadingAccount={loadingExtAccount}
        />
      </section>

      {/* ── Ethereal Section ──────────────────────────────────────────────────── */}
      <section>
        <EtherealSection
          strategies={ethStrategies}
          loadingStrategies={loadingEthStrategies}
        />
      </section>

      {/* ── Aktivitas Terbaru (gabungan semua DEX) ────────────────────────────── */}
      <section>
        <Card className="glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>Aktivitas Terbaru</CardTitle>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/15 border border-success/30 text-[10px] font-bold text-success uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    Live
                  </span>
                </div>
                <CardDescription>Log terkini dari semua bot — Lighter, Extended &amp; Ethereal</CardDescription>
              </div>
            </div>
            <Link href="/logs" className="text-sm text-primary hover:text-primary/80">Lihat semua</Link>
          </CardHeader>
          <CardContent>
            {loadingCombinedLogs ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : combinedLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Belum ada aktivitas bot.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {combinedLogs.map(log => (
                  <div key={log.key} className="flex gap-3 text-sm px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                    {/* Level dot */}
                    <div className="shrink-0 mt-2.5">
                      {log.level === "info" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      {log.level === "success" && <div className="w-2 h-2 rounded-full bg-success" />}
                      {log.level === "warn" && <div className="w-2 h-2 rounded-full bg-warning" />}
                      {log.level === "error" && <div className="w-2 h-2 rounded-full bg-destructive" />}
                    </div>
                    {/* Exchange badge */}
                    <div className="shrink-0 mt-1">
                      <ExchangeLogo exchange={log.exchange} size={14} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="font-medium text-foreground truncate">
                          {log.strategyName || (log.exchange === "lighter" ? "Sistem Lighter DEX" : "Sistem Extended")}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 font-mono">
                          {formatWIBTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs mt-0.5 truncate">{log.message}</p>
                      {log.details && (
                        <p className="text-muted-foreground/60 text-xs mt-0.5 truncate">{log.details}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Status langganan ─────────────────────────────────────────────────── */}
      {user && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 text-sm border ${
          isExpired
            ? "bg-destructive/10 border-destructive/30 text-destructive"
            : isExpiringSoon
            ? "bg-warning/10 border-warning/30 text-warning"
            : "bg-success/10 border-success/30 text-success"
        }`}>
          <Clock className="w-4 h-4 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">
              {isExpired ? "Langganan Habis" : `Langganan aktif — paket ${user.plan}`}
            </span>
            {expiresAt && (
              <span className="ml-2 font-normal opacity-80">
                {isExpired
                  ? `Kadaluarsa ${expiresAt.toLocaleDateString("id-ID")}`
                  : `Kadaluarsa ${expiresAt.toLocaleDateString("id-ID")} (${daysLeft} hari lagi)`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
