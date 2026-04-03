import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Shared query keys ─────────────────────────────────────────────────────────

export const EXT_QUERY_KEYS = {
  strategies: ["extended-strategies"] as const,
  account:    ["extended-account"] as const,
  pnlChart:   (strategyId: number) => ["extended-pnl-chart", strategyId] as const,
  logs:       (strategyId: number) => ["extended-logs", strategyId] as const,
};

// ── Base fetch helper ─────────────────────────────────────────────────────────

async function extFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/extended/strategies${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).error ?? `HTTP ${res.status}`);
  return json as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtStrategy {
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

export interface ExtAccount {
  configured: boolean;
  network?: string;
  balance: {
    equity: number;
    availableForTrade: number;
    unrealisedPnl: number;
    marginRatio: number;
    collateralName: string;
  } | null;
  positions: {
    id: number;
    market: string;
    side: string;
    size: string;
    openPrice: number;
    markPrice: number;
    unrealisedPnl: number;
    realisedPnl: number;
    leverage: number;
    liquidationPrice: number;
  }[];
}

export interface ExtLog {
  id: number;
  strategyId: number | null;
  strategyName: string | null;
  level: string;
  message: string;
  details: any;
  createdAt: string;
}

export interface ExtPnlDataPoint {
  date: string;
  buys: number;
  sells: number;
  estimatedPnl: number;
  cumulativePnl: number;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useExtendedStrategies() {
  return useQuery({
    queryKey: EXT_QUERY_KEYS.strategies,
    queryFn: () => extFetch<{ strategies: ExtStrategy[] }>("/"),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    select: (data) => data.strategies ?? [],
  });
}

export function useExtendedAccount() {
  return useQuery({
    queryKey: EXT_QUERY_KEYS.account,
    queryFn: () => extFetch<ExtAccount>("/account"),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useExtendedLogs(strategyId: number, enabled: boolean) {
  return useQuery({
    queryKey: EXT_QUERY_KEYS.logs(strategyId),
    queryFn: () =>
      extFetch<{ logs: ExtLog[] }>(`/logs/recent?strategyId=${strategyId}&limit=50`),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    select: (data) => data.logs ?? [],
  });
}

export function useExtendedPnlChart(strategyId: number, enabled: boolean) {
  return useQuery({
    queryKey: EXT_QUERY_KEYS.pnlChart(strategyId),
    queryFn: () =>
      extFetch<{ data: ExtPnlDataPoint[] }>(`/pnl-chart/data?strategyId=${strategyId}`),
    enabled,
    select: (data) => data.data ?? [],
  });
}

export function useStartExtendedBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (strategyId: number) =>
      extFetch(`/start/${strategyId}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: EXT_QUERY_KEYS.strategies });
    },
  });
}

export function useStopExtendedBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (strategyId: number) =>
      extFetch(`/stop/${strategyId}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: EXT_QUERY_KEYS.strategies });
    },
  });
}

export function useDeleteExtendedStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (strategyId: number) =>
      extFetch(`/${strategyId}`, { method: "DELETE" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: EXT_QUERY_KEYS.strategies });
    },
  });
}
