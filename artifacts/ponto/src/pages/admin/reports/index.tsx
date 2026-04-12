import { useState } from "react";
import { useGetPontoEmployees, useGetPontoRecords } from "@workspace/api-client-react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileDown, Calendar, User, TrendingUp, TrendingDown, Minus } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── 4-punch day record ──────────────────────────────────────────────────────
interface DayRecord {
  date: string;
  entradaDiaria:  string | null;
  saidaAlmoco:    string | null;
  retornoAlmoco:  string | null;
  saidaFinal:     string | null;
  totalMs: number;
  totalHours: string;
}

function punchTime(recs: any[], type: string): string | null {
  const r = recs.find((x: any) => x.type === type);
  if (!r) return null;
  return format(new Date(r.punchedAt), "HH:mm");
}

function computeDayRecord(dayDate: string, records: any[]): DayRecord {
  const dayRecs = records.filter(r => r.date === dayDate).sort(
    (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime()
  );

  const ed = punchTime(dayRecs, "ENTRADA_DIARIA");
  const sa = punchTime(dayRecs, "SAIDA_ALMOCO");
  const ra = punchTime(dayRecs, "RETORNO_ALMOCO");
  const sf = punchTime(dayRecs, "SAIDA_FINAL");

  let totalMs = 0;

  // New 4-punch model
  const edR = dayRecs.find((x: any) => x.type === "ENTRADA_DIARIA");
  const saR = dayRecs.find((x: any) => x.type === "SAIDA_ALMOCO");
  const raR = dayRecs.find((x: any) => x.type === "RETORNO_ALMOCO");
  const sfR = dayRecs.find((x: any) => x.type === "SAIDA_FINAL");

  if (edR && saR) totalMs += new Date(saR.punchedAt).getTime() - new Date(edR.punchedAt).getTime();
  if (raR && sfR) totalMs += new Date(sfR.punchedAt).getTime() - new Date(raR.punchedAt).getTime();

  // Legacy 2-punch model (backward compat)
  if (totalMs === 0) {
    const entradas = dayRecs.filter((r: any) => r.type === "entrada");
    const saidas   = dayRecs.filter((r: any) => r.type === "saida");
    const pairs = Math.min(entradas.length, saidas.length);
    for (let i = 0; i < pairs; i++) {
      totalMs += new Date(saidas[i].punchedAt).getTime() - new Date(entradas[i].punchedAt).getTime();
    }
  }

  let totalHours = "";
  if (totalMs > 0) {
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    totalHours = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Legacy entry for display
  const legacyEntry = punchTime(dayRecs, "entrada");
  const legacySaida = punchTime(dayRecs, "saida");

  return {
    date: dayDate,
    entradaDiaria: ed ?? legacyEntry,
    saidaAlmoco:   sa,
    retornoAlmoco: ra,
    saidaFinal:    sf ?? legacySaida,
    totalMs,
    totalHours,
  };
}

function msToHHMM(ms: number): string {
  const absMs = Math.abs(ms);
  const h = Math.floor(absMs / 3600000);
  const m = Math.floor((absMs % 3600000) / 60000);
  return `${ms < 0 ? "-" : "+"}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToMs(hhmm: string): number {
  const clean = hhmm.replace(/^[+-]/, "");
  const [h, mi] = clean.split(":").map(Number);
  const ms = (h * 60 + mi) * 60000;
  return hhmm.startsWith("-") ? -ms : ms;
}

export default function Reports() {
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear,     setSelectedYear]     = useState(String(currentYear));
  const [selectedMonth,    setSelectedMonth]    = useState(String(currentMonth).padStart(2, "0"));
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");

  const { data: employees = [] } = useGetPontoEmployees();
  const { data: allRecords = [] } = useGetPontoRecords();

  const monthStr = `${selectedYear}-${selectedMonth}`;
  const monthDays = eachDayOfInterval({
    start: startOfMonth(parseISO(`${monthStr}-01`)),
    end:   endOfMonth(parseISO(`${monthStr}-01`)),
  }).map(d => format(d, "yyyy-MM-dd"));

  const filteredRecords = (allRecords as any[]).filter((r: any) => r.date?.startsWith(monthStr));

  const targetEmployees = selectedEmployee === "all"
    ? employees
    : employees.filter(e => String(e.id) === selectedEmployee);

  const months = [
    { value: "01", label: "Janeiro"   }, { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março"     }, { value: "04", label: "Abril"     },
    { value: "05", label: "Maio"      }, { value: "06", label: "Junho"     },
    { value: "07", label: "Julho"     }, { value: "08", label: "Agosto"    },
    { value: "09", label: "Setembro"  }, { value: "10", label: "Outubro"   },
    { value: "11", label: "Novembro"  }, { value: "12", label: "Dezembro"  },
  ];
  const years = Array.from({ length: 3 }, (_, i) => String(currentYear - i));

  // Expected daily ms from weeklyHours (assume 5-day week)
  const expectedDailyMs = (emp: any) => {
    const weekHrs = emp.weeklyHours ?? 44;
    let workDays = 5;
    try {
      if ((emp as any).schedule) {
        const s = JSON.parse((emp as any).schedule);
        workDays = Object.values(s).filter((d: any) => !d.dayOff && d.in && d.out).length || 5;
      }
    } catch { /* keep 5 */ }
    return (weekHrs / workDays) * 3600000;
  };

  const exportPDF = (emp: typeof employees[0]) => {
    const empRecs  = filteredRecords.filter((r: any) => r.employeeId === emp.id);
    const dayData  = monthDays.map(day => computeDayRecord(day, empRecs));
    const totalMs  = dayData.reduce((s, d) => s + d.totalMs, 0);
    const totalH   = Math.floor(totalMs / 3600000);
    const totalM   = Math.floor((totalMs % 3600000) / 60000);
    const totalStr = `${String(totalH).padStart(2, "0")}:${String(totalM).padStart(2, "0")}`;

    const doc    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW  = doc.internal.pageSize.getWidth();

    doc.setFillColor(11, 20, 38);
    doc.rect(0, 0, pageW, 36, "F");
    doc.setFontSize(18); doc.setTextColor(59, 130, 246); doc.setFont("helvetica", "bold");
    doc.text("NFs – Bater Ponto", 14, 16);
    doc.setFontSize(9); doc.setTextColor(148, 163, 184); doc.setFont("helvetica", "normal");
    doc.text("Sistema de Gestão de Ponto", 14, 23);
    doc.setFontSize(11); doc.setTextColor(255, 255, 255);
    doc.text("ESPELHO DE PONTO MENSAL", pageW - 14, 16, { align: "right" });
    doc.setFontSize(9); doc.setTextColor(148, 163, 184);
    doc.text(`${months.find(m => m.value === selectedMonth)?.label} / ${selectedYear}`, pageW - 14, 23, { align: "right" });

    doc.setFillColor(20, 30, 50);
    doc.rect(0, 36, pageW, 24, "F");
    doc.setFontSize(12); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
    doc.text(emp.name, 14, 46);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(148, 163, 184);
    doc.text(`Cargo: ${emp.role}`, 14, 53);
    doc.text(`CPF: ${emp.cpf}`, 14, 58);
    doc.text(`Carga Horária Semanal: ${emp.weeklyHours}h`, pageW - 14, 46, { align: "right" });
    doc.text(`Total de Horas no Mês: ${totalStr}`, pageW - 14, 53, { align: "right" });

    const expMs  = expectedDailyMs(emp);
    const rows = dayData
      .filter(d => d.entradaDiaria || d.saidaAlmoco || d.retornoAlmoco || d.saidaFinal)
      .map(d => {
        const weekday = format(parseISO(d.date), "EEE", { locale: ptBR });
        const dayNum  = format(parseISO(d.date), "dd/MM/yyyy");
        const balMs   = d.totalMs > 0 ? d.totalMs - expMs : 0;
        const balStr  = d.totalMs > 0 ? msToHHMM(balMs) : "—";
        return [
          weekday.charAt(0).toUpperCase() + weekday.slice(1),
          dayNum,
          d.entradaDiaria  ?? "—",
          d.saidaAlmoco    ?? "—",
          d.retornoAlmoco  ?? "—",
          d.saidaFinal     ?? "—",
          d.totalHours     || "—",
          balStr,
        ];
      });

    autoTable(doc, {
      head: [["Dia", "Data", "Entrada", "Saída Almoço", "Retorno", "Saída Final", "Total", "Saldo"]],
      body: rows,
      startY: 63,
      theme: "grid",
      headStyles: { fillColor: [11, 20, 38], textColor: [59, 130, 246], fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59], halign: "center" },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 2: { cellWidth: 22 },
        3: { cellWidth: 28 }, 4: { cellWidth: 22 }, 5: { cellWidth: 25 },
        6: { cellWidth: 20, fontStyle: "bold" }, 7: { cellWidth: 20 },
      },
      margin: { left: 10, right: 10 },
      didParseCell: (data) => {
        if (data.column.index === 7 && data.section === "body") {
          const v = String(data.cell.raw ?? "");
          if (v.startsWith("+")) data.cell.styles.textColor = [22, 163, 74];
          else if (v.startsWith("-")) data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
    doc.setFillColor(11, 20, 38);
    doc.rect(10, finalY + 4, pageW - 20, 10, "F");
    doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
    doc.text(`TOTAL DE HORAS NO MÊS: ${totalStr}`, pageW / 2, finalY + 11, { align: "center" });

    const sigY = finalY + 28;
    doc.setDrawColor(100, 116, 139);
    doc.line(14, sigY, 90, sigY);
    doc.line(pageW - 90, sigY, pageW - 14, sigY);
    doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.setFont("helvetica", "normal");
    doc.text("Assinatura do Funcionário", 52, sigY + 5, { align: "center" });
    doc.text("Assinatura do Empregador", pageW - 52, sigY + 5, { align: "center" });
    doc.text(emp.name, 52, sigY + 10, { align: "center" });
    doc.text("NFs – Bater Ponto", pageW - 52, sigY + 10, { align: "center" });
    doc.setFontSize(6); doc.setTextColor(148, 163, 184);
    doc.text(`Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}  •  NFs – Sistema de Gestão de Ponto`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });

    doc.save(`espelho-ponto-${emp.name.replace(/\s+/g, "-")}-${monthStr}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground">Espelho de ponto mensal — 4 batidas por dia — com exportação em PDF.</p>
      </div>

      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[140px] bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px] bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[200px] bg-background/50 border-white/10"><SelectValue placeholder="Todos os funcionários" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os funcionários</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {targetEmployees.length === 0 ? (
          <Card className="glass-card"><CardContent className="py-12 text-center text-muted-foreground">Nenhum funcionário encontrado.</CardContent></Card>
        ) : (
          targetEmployees.map(emp => {
            const empRecs   = filteredRecords.filter((r: any) => r.employeeId === emp.id);
            const dayData   = monthDays.map(day => computeDayRecord(day, empRecs));
            const totalMs   = dayData.reduce((s, d) => s + d.totalMs, 0);
            const totalH    = Math.floor(totalMs / 3600000);
            const totalM    = Math.floor((totalMs % 3600000) / 60000);
            const totalStr  = `${String(totalH).padStart(2, "0")}:${String(totalM).padStart(2, "0")}`;
            const workDays  = dayData.filter(d => d.entradaDiaria).length;
            const expMs     = expectedDailyMs(emp);
            const balMs     = totalMs - expMs * workDays;
            const balStr    = workDays > 0 ? msToHHMM(balMs) : null;
            const hasDays   = dayData.some(d => d.entradaDiaria || d.saidaAlmoco || d.retornoAlmoco || d.saidaFinal);

            return (
              <Card key={emp.id} className="glass-card overflow-hidden">
                <CardHeader className="border-b border-white/5 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary border-2 border-border flex-shrink-0">
                        {emp.photo ? <img src={emp.photo} alt={emp.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg font-medium text-muted-foreground">{emp.name.charAt(0)}</div>}
                      </div>
                      <div>
                        <CardTitle className="text-lg font-display">{emp.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{emp.role} · CPF: {emp.cpf}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col gap-1 text-right">
                        <p className="text-2xl font-mono font-bold text-primary">{totalStr}</p>
                        <p className="text-xs text-muted-foreground">{workDays} dia(s) trabalhado(s)</p>
                        {balStr && (
                          <p className={`text-xs font-mono font-semibold ${balMs >= 0 ? "text-green-400" : "text-rose-400"}`}>
                            {balMs >= 0 ? "+" : ""}{balStr.replace(/^[+-]/, "")} saldo mensal
                          </p>
                        )}
                      </div>
                      <Button onClick={() => exportPDF(emp)} className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20" variant="outline">
                        <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/20 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Data</th>
                          <th className="px-3 py-3 text-center font-medium whitespace-nowrap text-green-400/70">Entrada</th>
                          <th className="px-3 py-3 text-center font-medium whitespace-nowrap text-amber-400/70">Saída Almoço</th>
                          <th className="px-3 py-3 text-center font-medium whitespace-nowrap text-blue-400/70">Retorno</th>
                          <th className="px-3 py-3 text-center font-medium whitespace-nowrap text-rose-400/70">Saída Final</th>
                          <th className="px-3 py-3 text-center font-medium whitespace-nowrap">Total</th>
                          <th className="px-3 py-3 text-right font-medium whitespace-nowrap">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {hasDays ? (
                          dayData
                            .filter(d => d.entradaDiaria || d.saidaAlmoco || d.retornoAlmoco || d.saidaFinal)
                            .map(d => {
                              const balDayMs = d.totalMs > 0 ? d.totalMs - expMs : null;
                              return (
                                <tr key={d.date} className="hover:bg-white/5 transition-colors">
                                  <td className="px-3 py-3 text-foreground font-medium whitespace-nowrap">
                                    {format(parseISO(d.date), "dd/MM · EEE", { locale: ptBR })}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {d.entradaDiaria  ? <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/5 font-mono text-xs">{d.entradaDiaria}</Badge>  : <span className="text-white/20">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {d.saidaAlmoco    ? <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/5 font-mono text-xs">{d.saidaAlmoco}</Badge>    : <span className="text-white/20">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {d.retornoAlmoco  ? <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/5 font-mono text-xs">{d.retornoAlmoco}</Badge>    : <span className="text-white/20">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {d.saidaFinal     ? <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/5 font-mono text-xs">{d.saidaFinal}</Badge>        : <span className="text-white/20">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-center font-mono font-semibold text-primary">
                                    {d.totalHours || <span className="text-white/30">—</span>}
                                  </td>
                                  <td className="px-3 py-3 text-right font-mono text-xs font-semibold">
                                    {balDayMs !== null ? (
                                      <span className={`flex items-center justify-end gap-0.5 ${balDayMs >= 0 ? "text-green-400" : "text-rose-400"}`}>
                                        {balDayMs >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                        {balDayMs === 0 ? <Minus className="w-3 h-3 text-muted-foreground" /> : msToHHMM(balDayMs)}
                                      </span>
                                    ) : <span className="text-white/20">—</span>}
                                  </td>
                                </tr>
                              );
                            })
                        ) : (
                          <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Nenhum registro neste mês.</td></tr>
                        )}
                      </tbody>
                      {hasDays && (
                        <tfoot>
                          <tr className="bg-primary/5 border-t border-primary/20">
                            <td colSpan={5} className="px-3 py-3 text-sm text-muted-foreground font-medium">Total do mês</td>
                            <td className="px-3 py-3 text-center font-mono font-bold text-primary text-base">{totalStr}</td>
                            <td className={`px-3 py-3 text-right font-mono font-bold text-base ${balMs >= 0 ? "text-green-400" : "text-rose-400"}`}>
                              {balStr ?? "—"}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
