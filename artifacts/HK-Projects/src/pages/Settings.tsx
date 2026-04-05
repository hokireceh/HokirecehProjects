import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetBotConfig, useUpdateBotConfig, useGetStrategies } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Settings as SettingsIcon, Save, KeyRound, ShieldAlert, Search, CheckCircle2, Bell, Bot, Send, Loader2, Eye, EyeOff, AlertTriangle, Zap, Code2 } from "lucide-react";
import { ExchangeLogo } from "@/components/ui/ExchangeLogo";
import { useToast } from "@/hooks/use-toast";

const configSchema = z.object({
  network: z.enum(["mainnet", "testnet"]),
  accountIndex: z.coerce.number().nullable().optional(),
  apiKeyIndex: z.preprocess(
    (val) => (val === "" || val === null || val === undefined) ? null : Number(val),
    z.number()
      .int("Harus bilangan bulat")
      .min(3, "Index minimal 3 (indeks 0–2 dicadangkan Lighter)")
      .max(254, "Index maksimal 254")
      .nullable()
      .optional()
  ),
  privateKey: z.string().optional(),
  l1Address: z.string().optional(),
  notifyBotToken: z.string().optional(),
  notifyChatId: z.string().optional(),
  notifyOnBuy: z.boolean().optional(),
  notifyOnSell: z.boolean().optional(),
  notifyOnError: z.boolean().optional(),
  notifyOnStart: z.boolean().optional(),
  notifyOnStop: z.boolean().optional(),
});

type FormData = z.infer<typeof configSchema>;

// ── Extended DEX Credentials Section ─────────────────────────────────────────

const JSON_TEMPLATE = `{
  "EXTENDED_API_KEY": "",
  "EXTENDED_STARK_PRIVATE_KEY": "",
  "EXTENDED_COLLATERAL_POSITION": ""
}`;

const ExtendedConfigSection = forwardRef<{ save: () => Promise<void> }>(function ExtendedConfigSection(_, ref) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<{ hasApiKey: boolean; hasPrivateKey: boolean; hasAccountId: boolean; accountId: string | null; extendedNetwork: "mainnet" | "testnet" }>({
    hasApiKey: false, hasPrivateKey: false, hasAccountId: false, accountId: null, extendedNetwork: "mainnet",
  });
  const [apiKey, setApiKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [extendedNetwork, setExtendedNetwork] = useState<"mainnet" | "testnet">("mainnet");
  const [showKey, setShowKey] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(JSON_TEMPLATE);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/extended/strategies/user-config", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCfg(data);
          setAccountId(data.accountId ?? "");
          setExtendedNetwork(data.extendedNetwork ?? "mainnet");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    setJsonError(null);
    try {
      const parsed = JSON.parse(text);
      if (parsed.EXTENDED_API_KEY !== undefined) setApiKey(parsed.EXTENDED_API_KEY);
      if (parsed.EXTENDED_STARK_PRIVATE_KEY !== undefined) setPrivateKey(parsed.EXTENDED_STARK_PRIVATE_KEY);
      if (parsed.EXTENDED_COLLATERAL_POSITION !== undefined) setAccountId(String(parsed.EXTENDED_COLLATERAL_POSITION));
    } catch {
      setJsonError("Format JSON tidak valid");
    }
  };

  const handleToggleJsonMode = () => {
    if (!jsonMode) {
      setJsonText(JSON.stringify({
        EXTENDED_API_KEY: apiKey,
        EXTENDED_STARK_PRIVATE_KEY: privateKey,
        EXTENDED_COLLATERAL_POSITION: accountId,
      }, null, 2));
      setJsonError(null);
    }
    setJsonMode(v => !v);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { extendedNetwork };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (privateKey.trim()) body.privateKey = privateKey.trim();
      if (accountId.trim()) body.accountId = accountId.trim();

      const res = await fetch("/api/extended/strategies/user-config", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan");

      setApiKey("");
      setPrivateKey("");
      toast({ title: "Konfigurasi Extended Disimpan" });
      // Refresh status
      fetch("/api/extended/strategies/user-config", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setCfg(data);
            setExtendedNetwork(data.extendedNetwork ?? "mainnet");
          }
        })
        .catch(() => {});
    } catch (err: any) {
      toast({ title: "Kesalahan", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; });
  useImperativeHandle(ref, () => ({ save: () => handleSaveRef.current() }), []);

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ExchangeLogo exchange="extended" size={20} />
              Kredensial Extended DEX
            </CardTitle>
            <CardDescription className="mt-1">
              API Key dan Stark Private Key untuk Extended DEX. Disimpan terenkripsi. l2Vault (collateral position untuk signing) diambil otomatis dari API saat bot start.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToggleJsonMode}
            className="shrink-0 gap-1.5 text-xs font-mono"
          >
            <Code2 className="w-3.5 h-3.5" />
            {jsonMode ? "Edit Form" : "{ } Edit as JSON"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              {[
                { label: "API Key", ok: cfg.hasApiKey },
                { label: "Stark Private Key", ok: cfg.hasPrivateKey },
                { label: "Account ID", ok: cfg.hasAccountId },
              ].map(({ label, ok }) => (
                <div key={label} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-muted/50 border-border text-muted-foreground"}`}>
                  {ok ? <CheckCircle2 className="w-3 h-3" /> : <Zap className="w-3 h-3 opacity-50" />}
                  {label} {ok ? "✓" : "belum diset"}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" /> Jaringan Extended
              </Label>
              <Select value={extendedNetwork} onValueChange={(v) => setExtendedNetwork(v as "mainnet" | "testnet")}>
                <SelectTrigger className="bg-background w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Jaringan Extended DEX — terpisah dari jaringan Lighter.</p>
            </div>

            {jsonMode ? (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-muted-foreground" /> Paste JSON Kredensial
                </Label>
                <textarea
                  value={jsonText}
                  onChange={e => handleJsonChange(e.target.value)}
                  rows={7}
                  spellCheck={false}
                  className={`w-full rounded-md border bg-background font-mono text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring ${jsonError ? "border-destructive focus:ring-destructive" : "border-input"}`}
                  placeholder={JSON_TEMPLATE}
                />
                {jsonError ? (
                  <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{jsonError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Paste JSON lalu klik Simpan. Field kosong = hapus nilai tersimpan.</p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> API Key Extended
                  </Label>
                  <Input
                    type="text"
                    placeholder={cfg.hasApiKey ? "••• tersimpan — isi untuk mengganti •••" : "Masukkan Extended API Key"}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="bg-background font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" /> Stark Private Key
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      placeholder={cfg.hasPrivateKey ? "••• tersimpan — isi untuk mengganti •••" : "Masukkan Stark Private Key"}
                      value={privateKey}
                      onChange={e => setPrivateKey(e.target.value)}
                      className="bg-background font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-muted-foreground" /> Account ID
                  </Label>
                  <Input
                    type="text"
                    placeholder={cfg.hasAccountId ? "••• tersimpan — isi untuk mengganti •••" : "mis. 264658"}
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className="bg-background font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Account ID dari Extended Exchange. l2Vault yang digunakan untuk signing diambil otomatis dari API — tidak perlu diisi manual.
                  </p>
                </div>
              </>
            )}

          </>
        )}
      </CardContent>
    </Card>
  );
});

// ── Ethereal DEX Credentials Section ─────────────────────────────────────────

const EtherealConfigSection = forwardRef<{ save: () => Promise<void> }>(function EtherealConfigSection(_, ref) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<{ hasCredentials: boolean; walletAddress?: string; subaccountId?: string; etherealNetwork?: string }>({ hasCredentials: false });
  const [privateKey, setPrivateKey] = useState("");
  const [subaccountId, setSubaccountId] = useState("");
  const [network, setNetwork] = useState<"mainnet" | "testnet">("mainnet");

  useEffect(() => {
    fetch("/api/ethereal/strategies/credentials", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCreds(data);
          setSubaccountId(data.subaccountId ?? "");
          setNetwork(data.etherealNetwork ?? "mainnet");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!privateKey && !creds.hasCredentials) {
      toast({ title: "Private key wajib diisi", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = { etherealNetwork: network };
      if (privateKey) body.privateKey = privateKey;
      if (subaccountId) body.subaccountId = subaccountId;
      const res = await fetch("/api/ethereal/strategies/credentials", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      const updated = await res.json();
      setCreds(updated);
      setPrivateKey("");
      setSubaccountId(updated.subaccountId ?? "");
      toast({ title: "Kredensial Ethereal tersimpan" });
    } catch {
      toast({ title: "Gagal menyimpan kredensial Ethereal", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; });
  useImperativeHandle(ref, () => ({ save: () => handleSaveRef.current() }), []);

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExchangeLogo exchange="ethereal" size={20} />
          Kredensial Ethereal DEX
        </CardTitle>
        <CardDescription className="mt-1">
          EVM Private Key dan Subaccount ID untuk Ethereal DEX. Disimpan terenkripsi. Digunakan untuk EIP-712 signing on-chain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-2">
              {[
                { label: "Private Key", ok: creds.hasCredentials },
                { label: "Subaccount ID", ok: !!creds.subaccountId },
              ].map(({ label, ok }) => (
                <div key={label} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-muted/50 border-border text-muted-foreground"}`}>
                  {ok ? <CheckCircle2 className="w-3 h-3" /> : <Zap className="w-3 h-3 opacity-50" />}
                  {label} {ok ? "✓" : "belum diset"}
                </div>
              ))}
              {creds.walletAddress && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-purple-500/10 border-purple-500/30 text-purple-400">
                  {creds.walletAddress.slice(0, 8)}…{creds.walletAddress.slice(-6)}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-purple-400" /> Jaringan Ethereal
              </Label>
              <Select value={network} onValueChange={(v) => setNetwork(v as "mainnet" | "testnet")}>
                <SelectTrigger className="bg-background w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> EVM Private Key
              </Label>
              <Input
                type="password"
                placeholder={creds.hasCredentials ? "••• tersimpan — isi untuk mengganti •••" : "0x... (64 hex chars)"}
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value)}
                className="bg-background font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Private key EVM wallet yang terdaftar di Ethereal. Jaga kerahasiaannya.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-muted-foreground" /> Subaccount ID
              </Label>
              <Input
                type="text"
                placeholder={creds.subaccountId ? "••• tersimpan — isi untuk mengganti •••" : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
                value={subaccountId}
                onChange={e => setSubaccountId(e.target.value)}
                className="bg-background font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Diambil otomatis saat menyimpan Private Key. Isi manual jika ingin mengganti.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Ethereal
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});

export default function Settings() {
  const { toast } = useToast();
  const { data: config, isLoading } = useGetBotConfig();
  const { data: strategiesData } = useGetStrategies();
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [detectedBalance, setDetectedBalance] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<"mainnet" | "testnet" | null>(null);
  const extendedRef = useRef<{ save: () => Promise<void> } | null>(null);
  const etherealRef = useRef<{ save: () => Promise<void> } | null>(null);
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);

  const runningBots = (strategiesData?.strategies ?? []).filter((s) => s.isRunning);

  const handleNetworkChange = (value: "mainnet" | "testnet") => {
    if (runningBots.length > 0) {
      setPendingNetwork(value);
      setShowNetworkWarning(true);
    } else {
      form.setValue("network", value);
    }
  };

  const confirmNetworkChange = () => {
    if (pendingNetwork) {
      form.setValue("network", pendingNetwork);
    }
    setPendingNetwork(null);
    setShowNetworkWarning(false);
  };

  const cancelNetworkChange = () => {
    setPendingNetwork(null);
    setShowNetworkWarning(false);
  };

  const updateMutation = useUpdateBotConfig({
    mutation: {
      onSuccess: () => {
        toast({ title: "Pengaturan Disimpan", description: "Konfigurasi kamu telah diperbarui." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Gagal menyimpan pengaturan", variant: "destructive" });
      }
    }
  });

  const form = useForm<FormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      network: "mainnet",
      accountIndex: null,
      apiKeyIndex: null,
      privateKey: "",
      l1Address: "",
      notifyBotToken: "",
      notifyChatId: "",
      notifyOnBuy: true,
      notifyOnSell: true,
      notifyOnError: true,
      notifyOnStart: true,
      notifyOnStop: false,
    }
  });

  useEffect(() => {
    if (config) {
      form.reset({
        network: config.network,
        accountIndex: config.accountIndex,
        apiKeyIndex: config.apiKeyIndex,
        l1Address: config.l1Address || "",
        privateKey: "",
        notifyBotToken: "",
        notifyChatId: (config as any).notifyChatId || "",
        notifyOnBuy: config.notifyOnBuy ?? true,
        notifyOnSell: config.notifyOnSell ?? true,
        notifyOnError: config.notifyOnError ?? true,
        notifyOnStart: config.notifyOnStart ?? true,
        notifyOnStop: config.notifyOnStop ?? false,
      });
    }
  }, [config, form]);

  const onSubmit = (data: FormData) => {
    const payload = { ...data };
    if (!payload.privateKey) delete payload.privateKey;
    if (!payload.notifyBotToken) delete payload.notifyBotToken;
    updateMutation.mutate({ data: payload });
    extendedRef.current?.save();
    etherealRef.current?.save();
  };

  const handleLookupAccount = async () => {
    const l1Address = form.getValues("l1Address");
    if (!l1Address || !l1Address.startsWith("0x")) {
      toast({ title: "Alamat Tidak Valid", description: "Masukkan L1 address yang valid, diawali 0x", variant: "destructive" });
      return;
    }
    setIsLookingUp(true);
    setDetectedBalance(null);
    try {
      const res = await fetch(`/api/config/lookup-account?l1Address=${encodeURIComponent(l1Address)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Akun tidak ditemukan");
      }
      const data = await res.json();
      form.setValue("accountIndex", data.accountIndex);
      setDetectedBalance(data.availableBalance);
      toast({
        title: "Akun Ditemukan",
        description: `Account Index: ${data.accountIndex} | Saldo: ${parseFloat(data.availableBalance).toFixed(2)} USDC`,
      });
    } catch (err: any) {
      toast({ title: "Pencarian Gagal", description: err.message, variant: "destructive" });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    try {
      const res = await fetch("/api/config/test-notification", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "✅ Notifikasi Terkirim!", description: data.message });
      } else {
        toast({ title: "❌ Gagal Kirim Notifikasi", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-primary" />
          Pengaturan
        </h1>
        <p className="text-muted-foreground mt-1">Konfigurasi API key Lighter.xyz dan preferensi jaringan</p>
      </header>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <Card key={i} className="glass-panel border-border/50">
              <CardHeader>
                <div className="h-5 w-40 bg-primary/10 animate-pulse rounded" />
                <div className="h-4 w-64 bg-muted animate-pulse rounded mt-1" />
              </CardHeader>
              <CardContent className="space-y-5">
                {[1, 2, 3].map(j => (
                  <div key={j} className="space-y-2">
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-10 w-full bg-muted/50 animate-pulse rounded-lg" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                Kredensial API
              </CardTitle>
              <CardDescription>
                Dapatkan dari antarmuka Lighter.xyz. Diperlukan untuk menandatangani transaksi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {config?.hasPrivateKey && (
                <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-lg flex items-center gap-3 text-sm">
                  <ShieldAlert className="w-5 h-5" />
                  <div>
                    <strong>Brankas Aman:</strong> Private key sudah dikonfigurasi dan tersimpan dengan aman. Isi ulang hanya jika ingin menggantinya.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Jaringan</Label>
                  <Select value={form.watch("network")} onValueChange={(v: any) => handleNetworkChange(v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mainnet">Mainnet</SelectItem>
                      <SelectItem value="testnet">Testnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>L1 Address</Label>
                  <div className="flex gap-2">
                    <Input {...form.register("l1Address")} placeholder="0x..." className="bg-background font-mono flex-1" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLookupAccount}
                      disabled={isLookingUp}
                      className="shrink-0 px-3"
                      title="Deteksi otomatis Account Index dari L1 Address"
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Klik ikon cari untuk deteksi otomatis Account Index kamu.</p>
                </div>

                <div className="space-y-2">
                  <Label>Account Index</Label>
                  <div className="relative">
                    <Input type="number" {...form.register("accountIndex")} placeholder="mis. 720746" className="bg-background font-mono" />
                    {detectedBalance !== null && (
                      <div className="flex items-center gap-1 text-xs text-success mt-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Terdeteksi — Saldo: {parseFloat(detectedBalance).toFixed(4)} USDC
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>API Key Index</Label>
                  <Input type="number" {...form.register("apiKeyIndex")} placeholder="mis. 7" className="bg-background font-mono" min={3} max={254} />
                  <p className="text-xs text-muted-foreground">Rentang valid: 3–254 (indeks 0–2 dicadangkan Lighter)</p>
                  {form.formState.errors.apiKeyIndex && (
                    <p className="text-xs text-destructive">{form.formState.errors.apiKeyIndex.message as string}</p>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Private Key</Label>
                  <div className="relative">
                    <Input 
                      type={showPrivateKey ? "text" : "password"}
                      {...form.register("privateKey")} 
                      placeholder={config?.hasPrivateKey ? "••••••••••••••••••••••••••••••••" : "Masukkan private key..."} 
                      className="bg-background font-mono pr-10" 
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Jaga kerahasiaannya. Diperlukan untuk menandatangani order di Lighter.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <ExtendedConfigSection ref={extendedRef} />

          <EtherealConfigSection ref={etherealRef} />

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notifikasi Telegram
              </CardTitle>
              <CardDescription>
                Konfigurasi bot Telegram untuk menerima notifikasi trade langsung di Telegram.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" /> Bot Token
                  </Label>
                  <Input
                    type="password"
                    {...form.register("notifyBotToken")}
                    placeholder={config?.hasNotifyBotToken ? "••••••••••••••••••••" : "123456:ABC-DEF..."}
                    className="bg-background font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Dapatkan dari <span className="text-primary">@BotFather</span> → /newbot
                    {config?.hasNotifyBotToken && <span className="text-success ml-2">✓ Terkonfigurasi</span>}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" /> Chat ID
                  </Label>
                  <Input
                    {...form.register("notifyChatId")}
                    placeholder="mis. 123456789"
                    className="bg-background font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Dapatkan dari <span className="text-primary">@userinfobot</span> → ID numerik kamu
                  </p>
                </div>
              </div>
              <div className="border-t border-border/30 pt-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-3">Pemicu notifikasi</p>
              {[
                { key: "notifyOnBuy" as const, label: "Order Beli", desc: "Notifikasi saat order BUY ditempatkan" },
                { key: "notifyOnSell" as const, label: "Order Jual", desc: "Notifikasi saat order SELL ditempatkan" },
                { key: "notifyOnError" as const, label: "Error", desc: "Notifikasi saat order error atau gagal" },
                { key: "notifyOnStart" as const, label: "Bot Dimulai", desc: "Notifikasi saat bot dijalankan" },
                { key: "notifyOnStop" as const, label: "Bot Berhenti / SL/TP", desc: "Notifikasi saat bot berhenti atau SL/TP terpicu" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={form.watch(key) ?? true}
                    onCheckedChange={(v) => form.setValue(key, v)}
                  />
                </div>
              ))}
              </div>
              <div className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestNotification}
                  disabled={isTesting || !config?.hasNotifyBotToken}
                  className="gap-2"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isTesting ? "Mengirim..." : "Test Notifikasi"}
                </Button>
                {!config?.hasNotifyBotToken && (
                  <p className="text-xs text-muted-foreground mt-1">Simpan Bot Token dulu untuk mengaktifkan test.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              size="lg" 
              className="text-white shadow-lg gap-2"
              style={{ background: "linear-gradient(135deg, #0fd4aa 0%, #0aaa88 100%)" }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {updateMutation.isPending ? "Menyimpan..." : "Simpan Konfigurasi"}
            </Button>
          </div>
        </form>
        </>
      )}

      <AlertDialog open={showNetworkWarning} onOpenChange={(open) => !open && cancelNetworkChange()}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Ganti Jaringan — Bot Sedang Aktif
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                Ada <strong>{runningBots.length} bot</strong> yang sedang berjalan:
              </span>
              <ul className="list-disc list-inside text-sm space-y-0.5 text-muted-foreground">
                {runningBots.map((b) => (
                  <li key={b.id}>{b.name} — {b.marketSymbol}</li>
                ))}
              </ul>
              <span className="block pt-1">
                Mengganti jaringan ke <strong>{pendingNetwork}</strong> tidak akan otomatis menghentikan bot. Bot yang berjalan akan tetap menggunakan jaringan lama sampai dihentikan dan diulang. Pastikan kamu menghentikan semua bot sebelum mengganti jaringan.
              </span>
              <span className="block text-warning font-medium pt-1">
                Lanjutkan mengganti jaringan?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelNetworkChange}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmNetworkChange}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Tetap Ganti Jaringan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
