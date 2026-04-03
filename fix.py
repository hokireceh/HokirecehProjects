#!/usr/bin/env python3
import re, sys

FILE = "artifacts/api-server/src/lib/ethereal/etherealMarkets.ts"

with open(FILE, "r") as f:
    src = f.read()

original = src

# ── Fix 5b-a: roundToStep ────────────────────────────────────────────────────
OLD_STEP = """\
export function roundToStep(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return quantity;
  return Math.round(quantity / lotSize) * lotSize;
}"""

NEW_STEP = """\
export function roundToStep(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return quantity;
  const q = new Decimal(quantity);
  const step = new Decimal(lotSize);
  // ROUND_DOWN: jangan pernah over-order dari yang dikonfigurasi user
  return q.div(step).toDecimalPlaces(0, Decimal.ROUND_DOWN).mul(step).toNumber();
}"""

if OLD_STEP not in src:
    print("✗ roundToStep: pattern tidak ditemukan — cek manual"); sys.exit(1)
src = src.replace(OLD_STEP, NEW_STEP, 1)
print("✓ roundToStep → Decimal")

# ── Fix 5b-b: roundToTick ────────────────────────────────────────────────────
OLD_TICK = """\
export function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}"""

NEW_TICK = """\
export function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  const p = new Decimal(price);
  const tick = new Decimal(tickSize);
  // ROUND_HALF_UP: standar untuk rounding harga
  return p.div(tick).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(tick).toNumber();
}"""

if OLD_TICK not in src:
    print("✗ roundToTick: pattern tidak ditemukan — cek manual"); sys.exit(1)
src = src.replace(OLD_TICK, NEW_TICK, 1)
print("✓ roundToTick → Decimal")

# ── Fix 5b-c: tambah import Decimal jika belum ada ───────────────────────────
if 'import Decimal from "decimal.js"' not in src:
    src = 'import Decimal from "decimal.js";\n' + src
    print("✓ import Decimal ditambahkan")
else:
    print("· import Decimal sudah ada, skip")

# ── Fix 7: warning log saat ProductInfo field fallback ───────────────────────
OLD_PARSE = """\
  const minOrderSize = parseFloat(p.minQuantity ?? "0.001");
  const maxOrderSize = parseFloat(p.maxQuantity ?? "100000");
  const lotSize = parseFloat(p.lotSize ?? "0.001");
  const tickSize = parseFloat(p.tickSize ?? "0.01");"""

NEW_PARSE = """\
  const minOrderSize = parseFloat(p.minQuantity ?? "0.001");
  const maxOrderSize = parseFloat(p.maxQuantity ?? "100000");
  const lotSize = parseFloat(p.lotSize ?? "0.001");
  const tickSize = parseFloat(p.tickSize ?? "0.01");

  // Warn jika field kritis tidak ada di response API — silent fallback berbahaya
  const _missingFields = [
    !p.minQuantity && "minQuantity",
    !p.lotSize     && "lotSize",
    !p.tickSize    && "tickSize",
  ].filter(Boolean);
  if (_missingFields.length > 0) {
    logger.warn(
      { ticker: p.ticker, missingFields: _missingFields },
      "[EtherealMarkets] Field tidak ada di response API, pakai default hardcoded"
    );
  }"""

if OLD_PARSE not in src:
    print("✗ ProductInfo parse: pattern tidak ditemukan — cek manual"); sys.exit(1)
src = src.replace(OLD_PARSE, NEW_PARSE, 1)
print("✓ Warning log ProductInfo ditambahkan")

# ── Tulis hasil ───────────────────────────────────────────────────────────────
with open(FILE, "w") as f:
    f.write(src)

print("\n✅ Semua fix selesai. Verifikasi:")
print(f"   grep -n 'ROUND_DOWN\\|ROUND_HALF_UP\\|_missingFields' {FILE}")
