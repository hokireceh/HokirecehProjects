import { Wallet } from "lucide-react";
import { useExtendedAccount } from "@/hooks/useExtended";

export function ExtAccountWidget() {
  const { data: account } = useExtendedAccount();

  if (!account?.configured) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="w-4 h-4" />
        <span>Belum terkonfigurasi</span>
      </div>
    );
  }

  const bal = account.balance;
  const posCount = account.positions?.length ?? 0;
  const totalUPnl = account.positions?.reduce((sum, p) => sum + (p.unrealisedPnl ?? 0), 0) ?? 0;
  const hasPositions = posCount > 0;

  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 px-2.5 py-1.5 rounded-lg">
        <Wallet className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs text-muted-foreground">
          {bal?.collateralName ?? "Saldo"}:
        </span>
        <span className="font-mono font-bold text-violet-300">
          {bal ? `$${bal.equity.toFixed(2)}` : "–"}
        </span>
      </div>
      {hasPositions && (
        <div className="flex items-center gap-1.5 bg-background/50 border border-border/40 px-2.5 py-1.5 rounded-lg">
          <span className="text-xs text-muted-foreground">{posCount} posisi</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">uPnL:</span>
          <span
            className={`font-mono font-bold text-xs ${totalUPnl >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {totalUPnl >= 0 ? "+" : ""}${totalUPnl.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
