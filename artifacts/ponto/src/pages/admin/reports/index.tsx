import { useState } from "react";
import { useGetPontoEmployees, useGetPontoRecords } from "@workspace/api-client-react";
import { format, getDaysInMonth, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileDown, Calendar, User } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DayRecord {
  date: string;
  entries: string[];
  exits: string[];
  totalHours: string;
}

function computeDayRecords(dayDate: string, records: ReturnType<typeof useGetPontoRecords>["data"]): DayRecord {
  const dayRecs = (records ?? []).filter(r => r.date === dayDate).sort(
    (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime()
  );
  const entries = dayRecs.filter(r => r.type === "entrada").map(r => format(new Date(r.punchedAt), "HH:mm"));
  const exits = dayRecs.filter(r => r.type === "saida").map(r => format(new Date(r.punchedAt), "HH:mm"));

  let totalMs = 0;
  const pairs = Math.min(entries.length, exits.length);
  for (let i = 0; i < pairs; i++) {
    const entDate = dayRecs.filter(r => r.type === "entrada")[i];
    const saiDate = dayRecs.filter(r => r.type === "saida")[i];
    if (entDate && saiDate) {
      totalMs += new Date(saiDate.punchedAt).getTime() - new Date(entDate.punchedAt).getTime();
    }
  }
  let totalHours = "";
  if (pairs > 0) {
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    totalHours = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return { date: dayDate, entries, exits, totalHours };
}

function msFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) * 60000;
}

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth).padStart(2, "0"));
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");

  const { data: employees = [] } = useGetPontoEmployees();
  const { data: allRecords = [] } = useGetPontoRecords();

  const monthStr = `${selectedYear}-${selectedMonth}`;
  const daysInMonth = getDaysInMonth(parseISO(`${monthStr}-01`));
  const monthDays = eachDayOfInterval({
    start: startOfMonth(parseISO(`${monthStr}-01`)),
    end: endOfMonth(parseISO(`${monthStr}-01`)),
  }).map(d => format(d, "yyyy-MM-dd"));

  const filteredRecords = allRecords.filter(r => r.date?.startsWith(monthStr));

  const targetEmployees = selectedEmployee === "all"
    ? employees
    : employees.filter(e => String(e.id) === selectedEmployee);

  const years = Array.from({ length: 3 }, (_, i) => String(currentYear - i));
  const months = [
    { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" }, { value: "04", label: "Abril" },
    { value: "05", label: "Maio" }, { value: "06", label: "Junho" },
    { value: "07", label: "Julho" }, { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" }, { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  const exportPDF = (emp: typeof employees[0]) => {
    const empRecords = filteredRecords.filter(r => r.employeeId === emp.id);
    const dayData = monthDays.map(day => computeDayRecords(day, empRecords));

    let totalMs = 0;
    for (const d of dayData) {
      if (d.totalHours) totalMs += msFromHHMM(d.totalHours);
    }
    const totalH = Math.floor(totalMs / 3600000);
    const totalM = Math.floor((totalMs % 3600000) / 60000);
    const totalStr = `${String(totalH).padStart(2, "0")}:${String(totalM).padStart(2, "0")}`;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(11, 20, 38);
    doc.rect(0, 0, pageW, 40, "F");

    // Logo placeholder / title
    doc.setFontSize(20);
    doc.setTextColor(59, 130, 246);
    doc.setFont("helvetica", "bold");
    doc.text("NFs – Bater Ponto", 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text("Sistema de Gestão de Ponto", 14, 26);

    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("ESPELHO DE PONTO MENSAL", pageW - 14, 18, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${months.find(m => m.value === selectedMonth)?.label} / ${selectedYear}`,
      pageW - 14, 26, { align: "right" }
    );

    // Employee info
    doc.setFillColor(20, 30, 50);
    doc.rect(0, 40, pageW, 28, "F");

    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(emp.name, 14, 52);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Cargo: ${emp.role}`, 14, 59);
    doc.text(`CPF: ${emp.cpf}`, 14, 65);
    doc.text(`Carga Horária Semanal: ${emp.weeklyHours}h`, pageW - 14, 52, { align: "right" });
    doc.text(`Total de Horas no Mês: ${totalStr}`, pageW - 14, 59, { align: "right" });

    // Table
    const tableRows = dayData
      .filter(d => d.entries.length > 0 || d.exits.length > 0 || true)
      .map(d => {
        const weekday = format(parseISO(d.date), "EEE", { locale: ptBR });
        const dayNum = format(parseISO(d.date), "dd/MM/yyyy");
        const hasRecords = d.entries.length > 0 || d.exits.length > 0;
        return [
          weekday.charAt(0).toUpperCase() + weekday.slice(1),
          dayNum,
          d.entries.join(" / ") || (hasRecords ? "" : "—"),
          d.exits.join(" / ") || (hasRecords ? "" : "—"),
          d.totalHours || "—",
        ];
      });

    autoTable(doc, {
      head: [["Dia", "Data", "Entrada(s)", "Saída(s)", "Total"]],
      body: tableRows,
      startY: 72,
      theme: "grid",
      headStyles: {
        fillColor: [11, 20, 38],
        textColor: [59, 130, 246],
        fontStyle: "bold",
        fontSize: 9,
        halign: "center",
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [30, 41, 59],
        halign: "center",
      },
      alternateRowStyles: {
        fillColor: [241, 245, 249],
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 30 },
        2: { cellWidth: 45 },
        3: { cellWidth: 45 },
        4: { cellWidth: 25, fontStyle: "bold" },
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 200;

    // Total bar
    doc.setFillColor(11, 20, 38);
    doc.rect(14, finalY + 4, pageW - 28, 12, "F");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL DE HORAS NO MÊS: ${totalStr}`, pageW / 2, finalY + 12, { align: "center" });

    // Signatures
    const sigY = finalY + 35;
    doc.setDrawColor(100, 116, 139);
    doc.line(14, sigY, 90, sigY);
    doc.line(pageW - 90, sigY, pageW - 14, sigY);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text("Assinatura do Funcionário", 52, sigY + 5, { align: "center" });
    doc.text("Assinatura do Empregador", pageW - 52, sigY + 5, { align: "center" });
    doc.text(emp.name, 52, sigY + 10, { align: "center" });
    doc.text("NFs – Bater Ponto", pageW - 52, sigY + 10, { align: "center" });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}  •  NFs – Sistema de Gestão de Ponto`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );

    doc.save(`espelho-ponto-${emp.name.replace(/\s+/g, "-")}-${monthStr}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground">Espelho de ponto mensal com exportação em PDF.</p>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[140px] bg-background/50 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px] bg-background/50 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[200px] bg-background/50 border-white/10">
                  <SelectValue placeholder="Todos os funcionários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os funcionários</SelectItem>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employee report cards */}
      <div className="space-y-4">
        {targetEmployees.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum funcionário encontrado.
            </CardContent>
          </Card>
        ) : (
          targetEmployees.map(emp => {
            const empRecords = filteredRecords.filter(r => r.employeeId === emp.id);
            const dayData = monthDays.map(day => computeDayRecords(day, empRecords));

            let totalMs = 0;
            for (const d of dayData) {
              if (d.totalHours) totalMs += msFromHHMM(d.totalHours);
            }
            const totalH = Math.floor(totalMs / 3600000);
            const totalM = Math.floor((totalMs % 3600000) / 60000);
            const totalStr = `${String(totalH).padStart(2, "0")}:${String(totalM).padStart(2, "0")}`;
            const workingDays = dayData.filter(d => d.entries.length > 0).length;

            return (
              <Card key={emp.id} className="glass-card overflow-hidden">
                <CardHeader className="border-b border-white/5 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary border-2 border-border flex-shrink-0">
                        {emp.photo ? (
                          <img src={emp.photo} alt={emp.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg font-medium text-muted-foreground">
                            {emp.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-lg font-display">{emp.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{emp.role} · CPF: {emp.cpf}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-mono font-bold text-primary">{totalStr}</p>
                        <p className="text-xs text-muted-foreground">{workingDays} dias trabalhados</p>
                      </div>
                      <Button
                        onClick={() => exportPDF(emp)}
                        className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
                        variant="outline"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Exportar PDF
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/20 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Data</th>
                          <th className="px-4 py-3 text-center font-medium">Entrada(s)</th>
                          <th className="px-4 py-3 text-center font-medium">Saída(s)</th>
                          <th className="px-4 py-3 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {dayData.filter(d => d.entries.length > 0 || d.exits.length > 0).map(d => (
                          <tr key={d.date} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-foreground font-medium">
                              {format(parseISO(d.date), "dd/MM · EEE", { locale: ptBR })}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-1 flex-wrap">
                                {d.entries.map((e, i) => (
                                  <Badge key={i} variant="outline" className="border-green-500/30 text-green-400 bg-green-500/5 font-mono text-xs">
                                    {e}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-1 flex-wrap">
                                {d.exits.map((s, i) => (
                                  <Badge key={i} variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/5 font-mono text-xs">
                                    {s}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                              {d.totalHours || "—"}
                            </td>
                          </tr>
                        ))}
                        {dayData.filter(d => d.entries.length > 0).length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                              Nenhum registro neste mês.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {totalStr !== "00:00" && (
                        <tfoot>
                          <tr className="bg-primary/5 border-t border-primary/20">
                            <td colSpan={3} className="px-4 py-3 text-sm text-muted-foreground font-medium">
                              Total do mês
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-primary text-base">
                              {totalStr}
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
