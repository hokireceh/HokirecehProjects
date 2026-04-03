import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriceDisplayProps {
  value: number;
  format?: "currency" | "percent" | "decimal";
  decimals?: number;
  showIcon?: boolean;
  className?: string;
  colored?: boolean;
}

export function PriceDisplay({ 
  value, 
  format = "decimal", 
  decimals = 2, 
  showIcon = false,
  className,
  colored = true
}: PriceDisplayProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isZero = value === 0;

  const formattedValue = new Intl.NumberFormat('en-US', {
    style: format === "currency" ? "currency" : "decimal",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));

  const finalString = format === "percent" ? `${formattedValue}%` : formattedValue;

  return (
    <div className={cn(
      "flex items-center gap-1 font-mono tracking-tight",
      colored && isPositive && "text-success",
      colored && isNegative && "text-destructive",
      colored && isZero && "text-muted-foreground",
      className
    )}>
      {showIcon && !isZero && (
        isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />
      )}
      <span>
        {isNegative && "-"}{finalString}
      </span>
    </div>
  );
}
