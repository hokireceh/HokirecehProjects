import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertCircle, TrendingUp, Lock } from "lucide-react";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Login gagal");
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="text"
                  placeholder="Contoh: A1B2C3D4E5"
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
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Belum punya password?</p>
          <p>Hubungi bot Telegram kami untuk berlangganan.</p>
        </div>
      </div>
    </div>
  );
}
