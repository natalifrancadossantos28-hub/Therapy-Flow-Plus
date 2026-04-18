import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useCreatePontoEmployee,
  useGetPontoEmployee,
  useUpdatePontoEmployee,
  useDeletePontoEmployee,
  getGetPontoEmployeesQueryKey,
} from "@/lib/ponto-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, Trash2, ArrowLeft, CalendarDays, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  type CameraInfo,
  describeCameraError,
  isGetUserMediaSupported,
  isSecureContextOk,
  listCameras,
  pickPreferredCamera,
} from "@/lib/camera";

const compressImage = (dataUrl: string, maxPx = 500, quality = 0.72): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
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

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
type DaySchedule = { in: string; out: string; dayOff: boolean };
type Schedule = Record<DayKey, DaySchedule>;

const DAY_LABELS: { key: DayKey; label: string; short: string }[] = [
  { key: "mon", label: "Segunda-feira", short: "Seg" },
  { key: "tue", label: "Terça-feira",   short: "Ter" },
  { key: "wed", label: "Quarta-feira",  short: "Qua" },
  { key: "thu", label: "Quinta-feira",  short: "Qui" },
  { key: "fri", label: "Sexta-feira",   short: "Sex" },
  { key: "sat", label: "Sábado",        short: "Sáb" },
];

const DEFAULT_SCHEDULE: Schedule = {
  mon: { in: "08:00", out: "17:00", dayOff: false },
  tue: { in: "08:00", out: "17:00", dayOff: false },
  wed: { in: "08:00", out: "17:00", dayOff: false },
  thu: { in: "08:00", out: "17:00", dayOff: false },
  fri: { in: "08:00", out: "17:00", dayOff: false },
  sat: { in: "",      out: "",      dayOff: true  },
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calcScheduleHours(schedule: Schedule): number {
  let total = 0;
  for (const day of Object.values(schedule)) {
    if (!day.dayOff && day.in && day.out) {
      const diff = timeToMinutes(day.out) - timeToMinutes(day.in);
      if (diff > 0) total += diff;
    }
  }
  return Math.round(total / 60 * 10) / 10;
}

function ScheduleEditor({ schedule, onChange }: { schedule: Schedule; onChange: (s: Schedule) => void }) {
  const totalHours = calcScheduleHours(schedule);
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {DAY_LABELS.map(({ key, label, short }) => {
          const day = schedule[key];
          return (
            <div key={key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${day.dayOff ? "border-white/5 bg-white/2 opacity-60" : "border-white/10 bg-background/40"}`}>
              <span className="w-10 text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">{short}</span>
              <span className="hidden sm:block text-sm text-foreground w-28 shrink-0">{label}</span>
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time"
                  value={day.in}
                  disabled={day.dayOff}
                  onChange={e => onChange({ ...schedule, [key]: { ...day, in: e.target.value } })}
                  className="bg-background/50 border-white/10 text-sm h-8 w-28"
                />
                <span className="text-muted-foreground text-xs shrink-0">até</span>
                <Input
                  type="time"
                  value={day.out}
                  disabled={day.dayOff}
                  onChange={e => onChange({ ...schedule, [key]: { ...day, out: e.target.value } })}
                  className="bg-background/50 border-white/10 text-sm h-8 w-28"
                />
                {day.in && day.out && !day.dayOff && timeToMinutes(day.out) > timeToMinutes(day.in) && (
                  <span className="text-xs text-primary font-mono shrink-0">
                    {Math.floor((timeToMinutes(day.out) - timeToMinutes(day.in)) / 60)}h{(timeToMinutes(day.out) - timeToMinutes(day.in)) % 60 > 0 ? `${(timeToMinutes(day.out) - timeToMinutes(day.in)) % 60}m` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch
                  checked={day.dayOff}
                  onCheckedChange={v => onChange({ ...schedule, [key]: { ...day, dayOff: v, in: v ? "" : day.in || "08:00", out: v ? "" : day.out || "17:00" } })}
                  className="scale-75"
                />
                <span className="text-xs text-muted-foreground">Folga</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/5 border border-primary/20">
        <span className="text-xs text-muted-foreground">Total calculado da escala:</span>
        <span className="font-mono font-bold text-primary">{totalHours}h / semana</span>
      </div>
    </div>
  );
}

const formSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  cpf: z.string().min(11, "CPF inválido").max(14, "CPF muito longo"),
  role: z.string().min(2, "Cargo muito curto"),
  weeklyHours: z.number().int().min(1).max(60).default(44),
  photo: z.string().nullable(),
  active: z.boolean().default(true),
  schedule: z.string().nullable().optional(),
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
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", cpf: "", role: "", weeklyHours: 44, photo: null, active: true, schedule: null },
  });

  useEffect(() => {
    if (employee && !isNew) {
      let emp_schedule = DEFAULT_SCHEDULE;
      try {
        if ((employee as any).schedule) emp_schedule = JSON.parse((employee as any).schedule);
      } catch { /* keep default */ }
      setSchedule(emp_schedule);
      form.reset({
        name: employee.name,
        cpf: employee.cpf,
        role: employee.role,
        weeklyHours: employee.weeklyHours ?? 44,
        photo: employee.photo ?? null,
        active: employee.active,
        schedule: (employee as any).schedule ?? null,
      });
    }
  }, [employee, isNew, form]);

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const openStream = async (deviceId?: string): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = deviceId
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : { video: true, audio: false };
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  const startWebcam = async () => {
    if (!isGetUserMediaSupported()) {
      toast({ title: "Câmera indisponível", description: "Navegador sem suporte a câmera.", variant: "destructive" });
      return;
    }
    if (!isSecureContextOk()) {
      toast({ title: "Câmera bloqueada", description: "Abra o site por HTTPS para usar a câmera.", variant: "destructive" });
      return;
    }
    try {
      // First call grants permission AND gives us labels for enumerateDevices.
      const initialStream = await openStream();
      const list = await listCameras();
      setCameras(list);

      // Pick preferred camera (USB webcam > external > last in list).
      const preferred = pickPreferredCamera(list);
      let chosenStream = initialStream;
      let chosenId = initialStream.getVideoTracks()[0]?.getSettings().deviceId ?? null;

      if (preferred && chosenId && preferred.deviceId && preferred.deviceId !== chosenId) {
        // Switch to the preferred device.
        initialStream.getTracks().forEach((t) => t.stop());
        chosenStream = await openStream(preferred.deviceId);
        chosenId = preferred.deviceId;
      }

      streamRef.current = chosenStream;
      setActiveCameraId(chosenId ?? preferred?.deviceId ?? null);
      if (videoRef.current) videoRef.current.srcObject = chosenStream;
      setUseWebcam(true);
    } catch (err) {
      toast({ title: "Câmera indisponível", description: describeCameraError(err), variant: "destructive" });
    }
  };

  const switchCamera = async (deviceId: string) => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await openStream(deviceId);
      streamRef.current = stream;
      setActiveCameraId(deviceId);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      toast({ title: "Não foi possível trocar a câmera", description: describeCameraError(err), variant: "destructive" });
    }
  };

  const stopWebcam = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setUseWebcam(false); };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    form.setValue("photo", await compressImage(canvas.toDataURL("image/jpeg", 1)));
    stopWebcam();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => form.setValue("photo", await compressImage(reader.result as string));
    reader.readAsDataURL(file);
  };

  const onSubmit = (data: FormValues) => {
    const payload = { ...data, schedule: JSON.stringify(schedule) };
    if (isNew) {
      createMutation.mutate({ data: payload as any }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetPontoEmployeesQueryKey() }); toast({ title: "Funcionário cadastrado!" }); setLocation("/admin/employees"); },
        onError: () => toast({ title: "Erro ao cadastrar", variant: "destructive" }),
      });
    } else {
      updateMutation.mutate({ id: employeeId, data: payload as any }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetPontoEmployeesQueryKey() }); toast({ title: "Dados atualizados!" }); setLocation("/admin/employees"); },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (confirm("Excluir este funcionário e todos os seus registros?")) {
      deleteMutation.mutate({ id: employeeId }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetPontoEmployeesQueryKey() }); toast({ title: "Funcionário excluído" }); setLocation("/admin/employees"); },
      });
    }
  };

  const schedHours = calcScheduleHours(schedule);
  const weeklyHours = form.watch("weeklyHours");
  const hoursMatch = Math.abs(schedHours - weeklyHours) < 0.5;

  if (isLoading && !isNew) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/employees">
            <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{isNew ? "Novo Funcionário" : "Editar Funcionário"}</h1>
            <p className="text-muted-foreground">Preencha os dados e a escala semanal do colaborador.</p>
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
                {useWebcam && cameras.length > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <label htmlFor="form-camera-picker" className="text-muted-foreground">Câmera:</label>
                    <select
                      id="form-camera-picker"
                      value={activeCameraId ?? ""}
                      onChange={(e) => switchCamera(e.target.value)}
                      className="bg-background/50 border border-white/10 rounded-md px-2 py-1 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                    >
                      {cameras.map((c) => (
                        <option key={c.deviceId} value={c.deviceId} className="bg-background text-foreground">
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  {useWebcam ? (
                    <><Button type="button" onClick={capturePhoto}>Capturar</Button><Button type="button" variant="outline" onClick={stopWebcam}>Cancelar</Button></>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={startWebcam} className="border-white/10"><Camera className="w-4 h-4 mr-2" /> Usar Câmera</Button>
                      <div className="relative">
                        <Button type="button" variant="outline" className="border-white/10"><Upload className="w-4 h-4 mr-2" /> Enviar Arquivo</Button>
                        <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} />
                      </div>
                      {form.watch("photo") && <Button type="button" variant="ghost" onClick={() => form.setValue("photo", null)}>Remover</Button>}
                    </>
                  )}
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} className="bg-background/50 border-white/10" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="cpf" render={({ field }) => (
                  <FormItem><FormLabel>CPF</FormLabel><FormControl><Input {...field} placeholder="000.000.000-00" className="bg-background/50 border-white/10" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem><FormLabel>Cargo</FormLabel><FormControl><Input {...field} placeholder="Ex: Fisioterapeuta" className="bg-background/50 border-white/10" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="weeklyHours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carga Horária Semanal (contrato)</FormLabel>
                    <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WEEKLY_HOURS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-white/10 p-4 bg-background/30 md:col-span-2">
                    <div><FormLabel className="text-base">Ativo</FormLabel><CardDescription>Funcionário pode registrar ponto</CardDescription></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
              </div>

              {/* Weekly Schedule */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Escala Semanal de Trabalho</span>
                  </div>
                  {schedHours > 0 && (
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${hoursMatch ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                      {hoursMatch ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {hoursMatch ? `Escala confere com ${weeklyHours}h semanais` : `Escala soma ${schedHours}h — contrato: ${weeklyHours}h`}
                    </div>
                  )}
                </div>
                <ScheduleEditor schedule={schedule} onChange={setSchedule} />
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
                <Link href="/admin/employees"><Button type="button" variant="ghost">Cancelar</Button></Link>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {isNew ? "Cadastrar Funcionário" : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
