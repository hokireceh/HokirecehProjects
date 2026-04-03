interface ExchangeLogoProps {
  exchange: "lighter" | "extended" | "ethereal";
  size?: number;
  className?: string;
}

export function ExchangeLogo({ exchange, size = 16, className = "" }: ExchangeLogoProps) {
  if (exchange === "ethereal") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: 3,
          background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
          color: "#fff",
          fontSize: Math.round(size * 0.6),
          fontWeight: 700,
          lineHeight: 1,
          flexShrink: 0,
        }}
        className={className}
        title="Ethereal DEX"
        role="img"
        aria-label="Ethereal DEX"
      >
        E
      </span>
    );
  }

  const src =
    exchange === "lighter"
      ? "/images/lighter-icon.png"
      : "/images/extended-icon.png";

  const alt = exchange === "lighter" ? "Lighter DEX" : "Extended";

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-sm object-contain shrink-0 ${className}`}
      style={{ imageRendering: "auto" }}
    />
  );
}
