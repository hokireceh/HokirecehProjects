import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertCircle, TrendingUp, Lock, HelpCircle, Send } from "lucide-react";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";

const FAQ_ITEMS = [
  {
    q: "Apa itu Hokireceh Projects?",
    a: "Platform manajemen trading bot otomatis yang berjalan di 3 exchange sekaligus: Lighter, Extended, dan Ethereal. Bot bekerja 24/7 mengeksekusi strategi grid trading tanpa perlu intervensi manual.",
  },
  {
    q: "Bagaimana cara mendapatkan password?",
    a: "Hubungi bot Telegram kami untuk informasi berlangganan. Setelah pembayaran dikonfirmasi, password akan dikirimkan langsung ke Telegram kamu.",
  },
  {
    q: "Exchange apa saja yang didukung?",
    a: "Saat ini mendukung 3 exchange: Lighter (on-chain orderbook), Extended (Starknet perpetuals), dan Ethereal (EVM perpetuals). Masing-masing bisa dijalankan secara independen.",
  },
  {
    q: "Apakah bot aman digunakan?",
    a: "Bot hanya menggunakan API key dengan permission trading saja — tidak ada akses withdraw. Private key disimpan terenkripsi dan tidak pernah dikirim ke server pihak ketiga.",
  },
  {
    q: "Apa yang terjadi jika bot error atau server restart?",
    a: "Bot dilengkapi mekanisme recovery otomatis. Setelah restart, bot akan memeriksa order yang sudah ada sebelum membuat order baru — tidak akan ada duplikasi order.",
  },
];


const TELEGRAM_URL = import.meta.env.VITE_TELEGRAM_BOT_USERNAME
  ? `https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME}`
  : null;

const MAX_ATTEMPTS = 3;

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);

  const blocked = failCount >= MAX_ATTEMPTS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    setError("");
    setLoading(true);
    const result = await login(password);
    setLoading(false);
    if (!result.success) {
      const next = failCount + 1;
      setFailCount(next);
      if (next >= MAX_ATTEMPTS) {
        setError("");
      } else {
        setError(`${result.error || "Login gagal"} (${next}/${MAX_ATTEMPTS})`);
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #0fd4aa 0%, #0aaa88 100%)" }}>
              <TrendingUp className="h-9 w-9 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Hokireceh</h1>
            <p className="text-[10px] font-semibold text-muted-foreground tracking-[0.2em] uppercase mt-1">Projects</p>
          </div>

          {/* Badge triple DEX — Lighter, Extended & Ethereal */}
          <div className="flex items-center justify-center gap-0 w-fit mx-auto rounded-lg overflow-hidden border border-border">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border-r border-border">
              <ExchangeLogo exchange="lighter" size={13} />
              <span className="text-[11px] font-semibold text-emerald-400 leading-none">Lighter</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border-r border-border">
              <ExchangeLogo exchange="extended" size={13} />
              <span className="text-[11px] font-semibold text-violet-400 leading-none">Extended</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10">
              <ExchangeLogo exchange="ethereal" size={13} />
              <span className="text-[11px] font-semibold text-purple-400 leading-none">Ethereal</span>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Login
            </CardTitle>
            <CardDescription>
              Masukkan password yang kamu terima dari bot Telegram setelah pembayaran.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {blocked ? (
              <div className="space-y-3 text-center">
                <div className="flex items-center gap-2 text-destructive text-sm justify-center">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Password salah 3 kali. Silakan hubungi kami.</span>
                </div>
                {TELEGRAM_URL ? (
                  <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button className="w-full gap-2 text-white border-0" style={{ background: "linear-gradient(135deg, #229ED9 0%, #1a7fb5 100%)" }}>
                      <Send className="h-4 w-4" />
                      Hubungi via Telegram
                    </Button>
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">Hubungi bot Telegram kami untuk mendapatkan password.</p>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="text"
                    placeholder="Contoh: SEPIBUKANSAPI"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.toUpperCase())}
                    className="font-mono tracking-widest text-center text-lg"
                    autoComplete="off"
                    autoFocus
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full text-white border-0"
                  style={{ background: "linear-gradient(135deg, #0fd4aa 0%, #0aaa88 100%)" }}
                  disabled={loading || !password.trim()}
                >
                  {loading ? "Memverifikasi..." : "Masuk"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Belum punya password?</p>
          <p>
            Hubungi bot{' '}
            {TELEGRAM_URL ? (
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500 hover:underline font-medium"
              >
                Telegram
              </a>
            ) : (
              "Telegram"
            )}{' '}
            kami untuk berlangganan.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            <span>Pertanyaan Umum</span>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-border rounded-lg px-4 overflow-hidden"
              >
                <AccordionTrigger className="text-sm text-left font-medium py-3 hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground pb-3 leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
