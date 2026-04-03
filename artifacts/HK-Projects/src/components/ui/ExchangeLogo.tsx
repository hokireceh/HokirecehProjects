interface ExchangeLogoProps {
  exchange: "lighter" | "extended" | "ethereal";
  size?: number;
  className?: string;
}

export function ExchangeLogo({ exchange, size = 16, className = "" }: ExchangeLogoProps) {
  const src =
    exchange === "lighter"
      ? "/images/lighter-icon.png"
      : exchange === "extended"
        ? "/images/extended-icon.png"
        : "/images/ethereal-icon.png";

  const alt =
    exchange === "lighter"
      ? "Lighter DEX"
      : exchange === "extended"
        ? "Extended DEX"
        : "Ethereal DEX";

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
