import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Check, Eye, ImagePlus, Lock, Pin, RefreshCw, RotateCcw, Save, Shuffle, Trash2, X, CalendarDays, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUILTIN_IMAGES, GALLERY_CATEGORIES, DEFAULT_CONFIG, DEFAULT_REF, builtinUrl, parseRef, portalVeilGradient,
  getVisualSettings, previewVisualSchedule, getCustomImage, verifyVisualAdmin, saveVisualSettings,
  addVisualImage, deleteVisualImage, fileToDataUrls,
  type VisualConfig, type CustomImage, type ScheduleDay, type GalleryCategory, type VisualOrder,
} from "@/lib/visual-settings";

const WEEK = [
  { d: "1", label: "Segunda" }, { d: "2", label: "Terça" }, { d: "3", label: "Quarta" }, { d: "4", label: "Quinta" },
  { d: "5", label: "Sexta" }, { d: "6", label: "Sábado" }, { d: "7", label: "Domingo" },
];
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type GalleryItem = { ref: string; name: string; cat: GalleryCategory | "own"; thumb: string; own: boolean; id?: number };

function errMsg(e: any): string {
  return e?.message || "Não foi possível concluir. Tente novamente.";
}

function fmtDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return `${DOW[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function PersonalizacaoVisual() {
  useDocumentTitle("Personalização Visual");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [config, setConfig] = useState<VisualConfig>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<VisualConfig>(DEFAULT_CONFIG);
  const [images, setImages] = useState<CustomImage[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [cat, setCat] = useState<string>("all");
  const [fullCache, setFullCache] = useState<Record<number, string>>({});
  const [viewer, setViewer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const adminPw = useRef<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState("");
  const pending = useRef<((pw: string) => Promise<void>) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const s = await getVisualSettings();
      setConfig(s.config);
      setSavedConfig(s.config);
      setImages(s.images);
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || loadError) return;
    const t = setTimeout(() => {
      previewVisualSchedule(config, 10).then(setSchedule).catch(() => setSchedule([]));
    }, 250);
    return () => clearTimeout(t);
  }, [config, images, loading, loadError]);

  const gallery: GalleryItem[] = useMemo(() => [
    ...BUILTIN_IMAGES.map((b) => ({ ref: `builtin:${b.id}`, name: b.name, cat: b.cat, thumb: builtinUrl(b.id), own: false })),
    ...images.map((i) => ({ ref: `custom:${i.id}`, name: i.name, cat: "own" as const, thumb: i.thumb, own: true, id: i.id })),
  ], [images]);

  const byRef = useCallback((ref: string) => gallery.find((g) => g.ref === ref) ?? gallery[0], [gallery]);

  const todayRef = config.mode === "fixed" ? config.fixed : schedule[0]?.ref ?? config.fixed;

  const ensureFull = useCallback(async (ref: string): Promise<string> => {
    const p = parseRef(ref);
    if (!p) return builtinUrl("clinica");
    if (p.kind === "builtin") return builtinUrl(p.id);
    if (fullCache[p.id]) return fullCache[p.id];
    const data = await getCustomImage(p.id);
    if (data) setFullCache((c) => ({ ...c, [p.id]: data }));
    return data || byRef(ref).thumb;
  }, [fullCache, byRef]);

  const [previewUrl, setPreviewUrl] = useState(builtinUrl("clinica"));
  useEffect(() => {
    let alive = true;
    const p = parseRef(todayRef);
    if (p?.kind === "custom") setPreviewUrl(fullCache[p.id] || byRef(todayRef).thumb);
    ensureFull(todayRef).then((u) => alive && setPreviewUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [todayRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  const withAdmin = (action: (pw: string) => Promise<void>) => {
    if (adminPw.current) {
      action(adminPw.current).catch((e) => {
        if (String(e?.message || "").includes("Senha de administrador")) {
          adminPw.current = null;
          pending.current = action;
          setPwValue(""); setPwError("Senha incorreta."); setPwOpen(true);
        } else toast({ title: "Erro", description: errMsg(e), variant: "destructive" });
      });
      return;
    }
    pending.current = action;
    setPwValue(""); setPwError(""); setPwOpen(true);
  };

  const confirmPw = async () => {
    if (!pwValue.trim()) { setPwError("Digite a senha."); return; }
    setBusy(true);
    try {
      await verifyVisualAdmin(pwValue);
      adminPw.current = pwValue;
      setPwOpen(false);
      const act = pending.current;
      pending.current = null;
      if (act) await act(pwValue);
    } catch (e) {
      setPwError(String((e as any)?.message || "").includes("Senha de administrador") ? "Senha incorreta." : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => withAdmin(async (pw) => {
    setBusy(true);
    try {
      const saved = await saveVisualSettings(pw, config);
      setConfig(saved);
      setSavedConfig(saved);
      toast({ title: "Salvo!", description: "A tela inicial de todos os usuários já usa essa configuração." });
    } catch (e) {
      throw e;
    } finally {
      setBusy(false);
    }
  });

  const onUpload = (file: File) => withAdmin(async (pw) => {
    setBusy(true);
    try {
      const { image, thumb } = await fileToDataUrls(file);
      const img = await addVisualImage(pw, file.name.replace(/\.[^.]+$/, "").slice(0, 40), image, thumb);
      setImages((l) => [...l, img]);
      setFullCache((c) => ({ ...c, [img.id]: image }));
      setCat("own");
      toast({ title: "Imagem adicionada à galeria" });
    } finally {
      setBusy(false);
    }
  });

  const onDelete = (item: GalleryItem) => {
    if (!item.id) return;
    if (!window.confirm(`Excluir "${item.name}" da galeria?`)) return;
    withAdmin(async (pw) => {
      setBusy(true);
      try {
        const cfg = await deleteVisualImage(pw, item.id!);
        setImages((l) => l.filter((i) => i.id !== item.id));
        setSavedConfig(cfg);
        setConfig((c) => ({
          ...c,
          fixed: c.fixed === item.ref ? DEFAULT_REF : c.fixed,
          rotation: c.rotation.filter((r) => r !== item.ref),
          week: Object.fromEntries(Object.entries(c.week).filter(([, r]) => r !== item.ref)),
        }));
        toast({ title: "Imagem excluída" });
      } finally {
        setBusy(false);
      }
    });
  };

  const openViewer = async (ref: string) => {
    setViewer(byRef(ref).thumb);
    try { setViewer(await ensureFull(ref)); } catch { /* fica a miniatura */ }
  };

  const toggleRotation = (ref: string) =>
    setConfig((c) => ({ ...c, rotation: c.rotation.includes(ref) ? c.rotation.filter((r) => r !== ref) : [...c.rotation, ref] }));

  const move = (i: number, d: number) => setConfig((c) => {
    const j = i + d;
    if (j < 0 || j >= c.rotation.length) return c;
    const r = [...c.rotation];
    [r[i], r[j]] = [r[j], r[i]];
    return { ...c, rotation: r };
  });

  const clickImage = (item: GalleryItem) => {
    if (config.mode === "fixed") setConfig((c) => ({ ...c, fixed: item.ref }));
    else if (config.order !== "week") toggleRotation(item.ref);
    else openViewer(item.ref);
  };

  const list = gallery.filter((g) => cat === "all" || g.cat === cat);
  const card = "rounded-2xl border border-border bg-card/95 p-5";

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (loadError) {
    return (
      <div className={cn(card, "max-w-xl")}>
        <p className="font-semibold">Não foi possível carregar a Personalização Visual.</p>
        <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
        <p className="text-sm text-muted-foreground mt-1">Se for a primeira vez, confirme que a migração 0126 foi executada no Supabase.</p>
        <button onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 font-semibold"><RefreshCw className="w-4 h-4" /> Tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <div>
        <p className="text-sm text-muted-foreground">Configurações › <span className="text-primary font-semibold">Personalização Visual</span></p>
        <h1 className="font-display text-2xl md:text-3xl font-extrabold mt-1 flex flex-wrap items-center gap-3">
          Personalização Visual
          <span className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1 border border-purple-500/50 bg-purple-500/15 text-purple-300"><Lock className="w-3.5 h-3.5" /> Somente administradores</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Escolha o fundo da tela inicial. Vale para todos os usuários e todos os computadores.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-5 min-w-0">
          <div className="grid sm:grid-cols-2 gap-3">
            {([
              { m: "fixed", t: "Fundo fixo", s: "Uma imagem fica até você trocar.", I: Pin },
              { m: "daily", t: "Automático diário", s: "Troca sozinho todo dia à meia-noite (Brasília).", I: RefreshCw },
            ] as const).map(({ m, t, s, I }) => (
              <button key={m} onClick={() => setConfig((c) => ({ ...c, mode: m }))}
                className={cn("text-left rounded-2xl border-2 p-4 transition-all", config.mode === m ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_22px_-6px_rgba(34,211,238,0.9)]" : "border-border bg-card hover:border-cyan-400/50")}>
                <span className="flex items-center gap-2 font-display font-bold"><I className="w-4 h-4 text-cyan-400" /> {t}</span>
                <span className="block text-xs text-muted-foreground mt-1">{s}</span>
              </button>
            ))}
          </div>

          {config.mode === "fixed" ? (
            <div className={card}>
              <h3 className="font-display font-bold mb-3">Fundo fixo</h3>
              <div className="flex items-center gap-3 rounded-xl border border-border p-3 mb-3">
                <img src={byRef(config.fixed).thumb} alt="" className="w-20 h-12 rounded-lg object-cover" />
                <div><p className="font-semibold text-sm">{byRef(config.fixed).name}</p><p className="text-xs text-muted-foreground">Fundo escolhido para a tela inicial</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openViewer(config.fixed)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"><Eye className="w-4 h-4" /> Visualizar</button>
                <button onClick={() => document.getElementById("galeria")?.scrollIntoView({ behavior: "smooth" })} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"><RefreshCw className="w-4 h-4" /> Substituir</button>
                <button onClick={() => setConfig((c) => ({ ...c, fixed: DEFAULT_REF }))} className="inline-flex items-center gap-2 rounded-xl border border-red-500/50 text-red-400 px-4 py-2 text-sm font-semibold hover:bg-red-500/10"><RotateCcw className="w-4 h-4" /> Restaurar padrão</button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">Clique numa imagem da galeria para substituir. O padrão é "Clínica (noite)".</p>
            </div>
          ) : (
            <div className={card}>
              <h3 className="font-display font-bold mb-3">Automático diário</h3>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border p-1 mb-3">
                {([
                  { o: "seq", t: "Sequência", I: ListOrdered },
                  { o: "random", t: "Aleatória sem repetir", I: Shuffle },
                  { o: "week", t: "Por dia da semana", I: CalendarDays },
                ] as Array<{ o: VisualOrder; t: string; I: typeof Shuffle }>).map(({ o, t, I }) => (
                  <button key={o} onClick={() => setConfig((c) => ({ ...c, order: o }))}
                    className={cn("rounded-lg px-2 py-2 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5", config.order === o ? "bg-cyan-400 text-[#04111f]" : "text-muted-foreground hover:bg-secondary")}>
                    <I className="w-4 h-4 hidden sm:block" /> {t}
                  </button>
                ))}
              </div>

              {config.order === "week" ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {WEEK.map(({ d, label }) => {
                    const ref = config.week[d] ?? config.fixed;
                    return (
                      <div key={d} className="rounded-xl border border-border p-2 text-center">
                        <img src={byRef(ref).thumb} alt="" className="w-full aspect-[16/10] object-cover rounded-lg mb-1" />
                        <p className="text-xs font-bold">{label}</p>
                        <select value={ref} onChange={(e) => setConfig((c) => ({ ...c, week: { ...c.week, [d]: e.target.value } }))}
                          className="mt-1 w-full text-[11px] rounded-md border border-border bg-background px-1 py-1">
                          {gallery.map((g) => <option key={g.ref} value={g.ref}>{g.name}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    {config.order === "seq"
                      ? "Marque ✓ na galeria as imagens que entram na rotação e use as setas para mudar a ordem. Ao terminar, a sequência recomeça."
                      : "Sorteia entre as imagens marcadas com ✓, sem repetir nenhuma até passar por todas. Depois começa um novo ciclo."}
                  </p>
                  <div className="space-y-1.5">
                    {config.rotation.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma imagem marcada. Enquanto isso, fica o fundo fixo.</p>}
                    {config.rotation.map((ref, i) => (
                      <div key={ref} className="flex items-center gap-3 rounded-xl border border-border p-1.5">
                        <span className="w-6 text-center font-extrabold text-cyan-400">{config.order === "seq" ? i + 1 : "•"}</span>
                        <img src={byRef(ref).thumb} alt="" className="w-16 h-10 rounded-lg object-cover" />
                        <span className="flex-1 text-sm truncate">{byRef(ref).name}</span>
                        {config.order === "seq" && <>
                          <button aria-label="Subir" onClick={() => move(i, -1)} className="p-1.5 rounded-lg hover:bg-secondary"><ArrowUp className="w-4 h-4" /></button>
                          <button aria-label="Descer" onClick={() => move(i, 1)} className="p-1.5 rounded-lg hover:bg-secondary"><ArrowDown className="w-4 h-4" /></button>
                        </>}
                        <button aria-label="Tirar da rotação" onClick={() => toggleRotation(ref)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <h4 className="font-semibold text-sm mt-4 mb-2">Próximos dias</h4>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {schedule.map((s, i) => (
                  <div key={s.date} className={cn("shrink-0 w-24 text-center text-[11px]", i === 0 ? "text-cyan-400 font-bold" : "text-muted-foreground")}>
                    <img src={byRef(s.ref).thumb} alt="" className={cn("w-full h-14 object-cover rounded-lg mb-1 border-2", i === 0 ? "border-cyan-400" : "border-transparent")} />
                    {i === 0 ? "Hoje" : fmtDay(s.date)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div id="galeria" className={card}>
            <h3 className="font-display font-bold mb-3">Galeria</h3>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {GALLERY_CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => setCat(c.id)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-semibold border", cat === c.id ? "bg-cyan-400 text-[#04111f] border-cyan-400" : "border-border text-muted-foreground hover:text-foreground")}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {list.map((g) => {
                const selected = config.mode === "fixed" ? config.fixed === g.ref : config.order !== "week" && config.rotation.includes(g.ref);
                return (
                  <div key={g.ref} role="button" tabIndex={0} onClick={() => clickImage(g)} onKeyDown={(e) => e.key === "Enter" && clickImage(g)}
                    className={cn("relative rounded-xl overflow-hidden aspect-[16/10] border-2 cursor-pointer bg-center bg-cover", selected ? "border-cyan-400 shadow-[0_0_16px_-2px_rgba(34,211,238,0.9)]" : "border-transparent")}
                    style={{ backgroundImage: `url("${g.thumb}")` }}>
                    {config.mode === "daily" && config.order !== "week" && (
                      <span className={cn("absolute top-1.5 left-1.5 w-6 h-6 rounded-md border-2 border-cyan-300 flex items-center justify-center", selected ? "bg-cyan-400 text-[#04111f]" : "bg-black/60 text-transparent")}><Check className="w-4 h-4" /></span>
                    )}
                    <span className="absolute top-1.5 right-1.5 flex gap-1">
                      <button aria-label="Visualizar" onClick={(e) => { e.stopPropagation(); openViewer(g.ref); }} className="w-7 h-7 rounded-lg bg-black/65 text-white flex items-center justify-center"><Eye className="w-3.5 h-3.5" /></button>
                      {g.own && <button aria-label="Excluir" onClick={(e) => { e.stopPropagation(); onDelete(g); }} className="w-7 h-7 rounded-lg bg-black/65 text-red-300 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </span>
                    {g.own && <span className="absolute bottom-1.5 right-1.5 text-[10px] font-bold bg-purple-500 text-white rounded px-1.5">minha</span>}
                    <span className="absolute inset-x-0 bottom-0 px-2 pt-5 pb-1.5 text-[11.5px] font-bold text-white bg-gradient-to-t from-black/80 to-transparent">{g.name}</span>
                  </div>
                );
              })}
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="rounded-xl aspect-[16/10] border-2 border-dashed border-cyan-400/60 text-cyan-400 text-sm font-bold flex flex-col items-center justify-center gap-1 hover:bg-cyan-400/5">
                <ImagePlus className="w-6 h-6" /> Enviar imagem
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
            <p className="text-xs text-muted-foreground mt-3">As imagens da galeria são originais, criadas para o NFs, sem fotos de pacientes. Não envie fotos de pacientes sem autorização. As imagens que vêm com o sistema não podem ser excluídas.</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className={cn(card, "xl:sticky xl:top-4")}>
            <h3 className="font-display font-bold mb-3">Pré-visualização da tela inicial</h3>
            <div className="relative rounded-2xl overflow-hidden aspect-[16/10] border border-border bg-[#050b1f] bg-center bg-cover" style={{ backgroundImage: `${portalVeilGradient(config.veil)}, url("${previewUrl}")` }}>
              <div className="absolute right-3 top-2 text-right text-[15px] leading-none text-[#eaf2ff]" style={{ fontFamily: "Caveat, cursive", textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>Inclusão<br />Desenvolvimento<br />Acolhimento</div>
              <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
                <p className="font-display font-extrabold text-white text-lg sm:text-xl" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>NFs Gestão Terapêutica</p>
                <p className="text-[10px] text-[#dbe7ff] mb-3">Cuidado, inclusão e desenvolvimento em um só lugar.</p>
                <div className="grid grid-cols-3 gap-2 w-[92%]">
                  {[["Recepção", "#22c55e"], ["Profissional", "#22d3ee"], ["Administração", "#a855f7"]].map(([t, c]) => (
                    <div key={t} className="portal-access-card rounded-xl px-1.5 pt-3 pb-2 text-center" style={{ ["--c" as string]: c } as React.CSSProperties}>
                      <p className="font-display font-bold text-[11px] text-white">{t}</p>
                      <span className="portal-access-btn mt-2 block rounded-full py-1 text-[9px] font-extrabold text-[#04111f]">Acessar</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {config.mode === "fixed" ? <>Fundo fixo: <b className="text-foreground">{byRef(config.fixed).name}</b></> : <>Hoje (horário de Brasília): <b className="text-foreground">{byRef(todayRef).name}</b></>}
            </p>
            <div className="mt-4">
              <div className="flex justify-between text-sm"><span>Escurecer a foto (legibilidade)</span><b>{config.veil}%</b></div>
              <input type="range" min={20} max={80} value={config.veil} onChange={(e) => setConfig((c) => ({ ...c, veil: Number(e.target.value) }))} className="w-full accent-cyan-400" />
              <p className="text-xs text-muted-foreground">Em fotos claras, aumente o escurecimento para manter os cartões legíveis.</p>
            </div>
            <button onClick={save} disabled={busy || !dirty}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-[#04111f] bg-gradient-to-r from-cyan-400 to-blue-500 disabled:opacity-50 shadow-[0_0_20px_-6px_rgba(34,211,238,0.9)]">
              <Save className="w-4 h-4" /> {dirty ? "Salvar para todos" : "Tudo salvo"}
            </button>
          </div>
        </div>
      </div>

      {pwOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !busy && setPwOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-cyan-400/40 bg-card p-5 shadow-[0_0_40px_-10px_rgba(34,211,238,0.8)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-lg flex items-center gap-2"><Lock className="w-4 h-4 text-cyan-400" /> Confirmar administrador</h3>
            <p className="text-sm text-muted-foreground mt-1">Digite a senha de administrador da empresa ou a senha do Painel Master. O servidor só aceita a alteração com a senha correta.</p>
            <input type="password" autoFocus value={pwValue} onChange={(e) => { setPwValue(e.target.value); setPwError(""); }}
              onKeyDown={(e) => e.key === "Enter" && confirmPw()} placeholder="Senha do administrador"
              className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
            {pwError && <p className="text-sm text-red-400 mt-1">{pwError}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setPwOpen(false)} disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Cancelar</button>
              <button onClick={confirmPw} disabled={busy} className="rounded-xl bg-cyan-400 text-[#04111f] px-4 py-2 text-sm font-bold">{busy ? "Verificando..." : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setViewer(null)}>
          <img src={viewer} alt="Visualização" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
