import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreatePontoEmployee, useGetPontoEmployee, useUpdatePontoEmployee, useDeletePontoEmployee, getGetPontoEmployeesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, Trash2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

// Resize + compress to JPEG before sending — keeps payload well under 100 KB
const compressImage = (dataUrl: string, maxPx = 500, quality = 0.72): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });

const WEEKLY_HOURS_OPTIONS = [
  { value: "20", label: "20 horas" },
  { value: "30", label: "30 horas" },
  { value: "36", label: "36 horas" },
  { value: "40", label: "40 horas" },
  { value: "44", label: "44 horas (CLT)" },
];

const formSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  cpf: z.string().min(11, "CPF inválido").max(14, "CPF muito longo"),
  role: z.string().min(2, "Cargo muito curto"),
  weeklyHours: z.number().int().min(1).max(60).default(44),
  photo: z.string().nullable(),
  active: z.boolean().default(true),
  entryTime: z.string().nullable().optional(),
  exitTime: z.string().nullable().optional(),
  breakMinutes: z.number().int().default(60),
});

type FormValues = z.infer<typeof formSchema>;

export default function EmployeeForm() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isNew = !id || id === "new";
  const employeeId = id ? parseInt(id, 10) : 0;

  const { data: employee, isLoading } = useGetPontoEmployee(employeeId, {
    query: { enabled: !isNew }
  });

  const createMutation = useCreatePontoEmployee();
  const updateMutation = useUpdatePontoEmployee();
  const deleteMutation = useDeletePontoEmployee();

  const [useWebcam, setUseWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      cpf: "",
      role: "",
      weeklyHours: 44,
      photo: null,
      active: true,
      entryTime: null,
      exitTime: null,
      breakMinutes: 60,
    }
  });

  useEffect(() => {
    if (employee && !isNew) {
      form.reset({
        name: employee.name,
        cpf: employee.cpf,
        role: employee.role,
        weeklyHours: employee.weeklyHours ?? 44,
        photo: employee.photo ?? null,
        active: employee.active,
        entryTime: (employee as any).entryTime ?? null,
        exitTime: (employee as any).exitTime ?? null,
        breakMinutes: (employee as any).breakMinutes ?? 60,
      });
    }
  }, [employee, isNew, form]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setUseWebcam(true);
    } catch (err) {
      toast({ title: "Erro na câmera", description: "Não foi possível acessar a câmera", variant: "destructive" });
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setUseWebcam(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const raw = canvas.toDataURL("image/jpeg", 1);
    const compressed = await compressImage(raw);
    form.setValue("photo", compressed);
    stopWebcam();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result as string);
      form.setValue("photo", compressed);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = (data: FormValues) => {
    if (isNew) {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPontoEmployeesQueryKey() });
          toast({ title: "Sucesso", description: "Funcionário cadastrado" });
          setLocation("/admin/employees");
        },
        onError: () => toast({ title: "Erro", description: "Falha ao cadastrar", variant: "destructive" })
      });
    } else {
      updateMutation.mutate({ id: employeeId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPontoEmployeesQueryKey() });
          toast({ title: "Sucesso", description: "Funcionário atualizado" });
          setLocation("/admin/employees");
        },
        onError: () => toast({ title: "Erro", description: "Falha ao atualizar", variant: "destructive" })
      });
    }
  };

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir este funcionário?")) {
      deleteMutation.mutate({ id: employeeId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPontoEmployeesQueryKey() });
          toast({ title: "Sucesso", description: "Funcionário excluído" });
          setLocation("/admin/employees");
        }
      });
    }
  };

  if (isLoading && !isNew) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/employees">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              {isNew ? "Novo Funcionário" : "Editar Funcionário"}
            </h1>
            <p className="text-muted-foreground">Preencha os dados do colaborador.</p>
          </div>
        </div>
        {!isNew && (
          <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
            <Trash2 className="w-4 h-4 mr-2" /> Excluir
          </Button>
        )}
      </div>

      <Card className="glass-card">
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* Photo */}
              <div className="flex flex-col items-center space-y-4">
                <div className="w-48 h-48 rounded-full overflow-hidden bg-secondary border-4 border-border relative">
                  {useWebcam ? (
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                  ) : form.watch("photo") ? (
                    <img src={form.watch("photo") as string} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <Camera className="w-12 h-12 mb-2 opacity-50" />
                      <span className="text-sm font-medium">Sem foto</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {useWebcam ? (
                    <>
                      <Button type="button" onClick={capturePhoto}>Capturar</Button>
                      <Button type="button" variant="outline" onClick={stopWebcam}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={startWebcam} className="border-white/10">
                        <Camera className="w-4 h-4 mr-2" /> Usar Câmera
                      </Button>
                      <div className="relative">
                        <Button type="button" variant="outline" className="border-white/10">
                          <Upload className="w-4 h-4 mr-2" /> Enviar Arquivo
                        </Button>
                        <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} />
                      </div>
                      {form.watch("photo") && (
                        <Button type="button" variant="ghost" onClick={() => form.setValue("photo", null)}>
                          Remover
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl><Input {...field} className="bg-background/50 border-white/10" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="cpf" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl><Input {...field} placeholder="000.000.000-00" className="bg-background/50 border-white/10" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: Fisioterapeuta" className="bg-background/50 border-white/10" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="weeklyHours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carga Horária Semanal</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={v => field.onChange(Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-white/10">
                          <SelectValue placeholder="Selecione a carga horária" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WEEKLY_HOURS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                        <SelectItem value="custom">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    {!WEEKLY_HOURS_OPTIONS.find(o => o.value === String(field.value)) && (
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                        className="mt-2 bg-background/50 border-white/10"
                        placeholder="Horas por semana"
                      />
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-white/10 p-4 bg-background/30 md:col-span-2">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Ativo</FormLabel>
                      <CardDescription>Funcionário pode registrar ponto</CardDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              {/* ── Schedule Section ─────────────────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-white/10">
                  <span className="text-sm font-semibold text-foreground">Horário de Trabalho</span>
                  <span className="text-xs text-muted-foreground">(opcional — usado para controle de horas extras)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="entryTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário de Entrada</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          value={field.value ?? ""}
                          onChange={e => field.onChange(e.target.value || null)}
                          className="bg-background/50 border-white/10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="exitTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário de Saída</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          value={field.value ?? ""}
                          onChange={e => field.onChange(e.target.value || null)}
                          className="bg-background/50 border-white/10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="breakMinutes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tempo de Intervalo</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={v => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-white/10">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="15">15 minutos</SelectItem>
                          <SelectItem value="60">1 hora</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Preview do cálculo de saída efetiva */}
                {form.watch("entryTime") && form.watch("exitTime") && (() => {
                  const entry = form.watch("entryTime")!;
                  const exit = form.watch("exitTime")!;
                  const brk = form.watch("breakMinutes") ?? 60;
                  const effMins = (() => {
                    const [eh, em] = exit.split(":").map(Number);
                    return (eh * 60 + em) - (60 - brk);
                  })();
                  const effTime = `${String(Math.floor(effMins / 60)).padStart(2, "0")}:${String(effMins % 60).padStart(2, "0")}`;
                  const sameAsExit = brk === 60;
                  return (
                    <div className="flex items-start gap-2 text-xs rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-muted-foreground">
                      <span className="text-primary font-semibold shrink-0">Resumo:</span>
                      <span>
                        Entrada liberada a partir das <strong className="text-foreground">{entry.slice(0, 5).replace(/^(\d{2}):(\d{2})$/, (_, h, m) => {
                          const t = Number(h)*60+Number(m)-10;
                          return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;
                        })}</strong>.
                        {" "}Saída bloqueada após{" "}
                        <strong className="text-foreground">{(() => {
                          const [h, m] = effTime.split(":").map(Number);
                          const t = h*60+m+10;
                          return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;
                        })()}</strong>
                        {!sameAsExit && <span className="text-amber-400"> (saída real: {effTime} por intervalo de {brk} min)</span>}.
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
                <Link href="/admin/employees">
                  <Button type="button" variant="ghost">Cancelar</Button>
                </Link>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {isNew ? "Cadastrar" : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
