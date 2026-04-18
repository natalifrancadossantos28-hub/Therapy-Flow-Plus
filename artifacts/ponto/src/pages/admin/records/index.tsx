import { useState } from "react";
import { useGetPontoRecords, useGetPontoEmployees } from "@/lib/ponto-hooks";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, ArrowRightLeft } from "lucide-react";

export default function RecordsList() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [employeeId, setEmployeeId] = useState<string>("all");

  const { data: employees = [] } = useGetPontoEmployees();
  const { data: records = [], isLoading } = useGetPontoRecords({
    date: date || undefined,
    employeeId: employeeId !== "all" ? parseInt(employeeId, 10) : undefined
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Espelho de Ponto</h1>
        <p className="text-muted-foreground">Histórico de todas as marcações de ponto.</p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center space-x-2 flex-1">
              <CalendarIcon className="w-4 h-4 text-muted-foreground" />
              <Input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="bg-background/50 border-white/10 w-[200px]"
              />
            </div>
            <div className="w-[300px]">
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="bg-background/50 border-white/10">
                  <SelectValue placeholder="Todos os funcionários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os funcionários</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="space-y-4">
               {[...Array(5)].map((_, i) => (
                 <div key={i} className="w-full h-12 bg-muted/50 animate-pulse rounded-lg"></div>
               ))}
             </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum registro encontrado para este filtro.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/30 border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4 font-medium">Data/Hora</th>
                    <th className="px-6 py-4 font-medium">Funcionário</th>
                    <th className="px-6 py-4 font-medium">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-mono text-muted-foreground">
                        {format(new Date(record.punchedAt), "dd/MM/yyyy HH:mm:ss")}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary flex-shrink-0">
                            {record.employeePhoto ? (
                              <img src={record.employeePhoto} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-medium text-muted-foreground text-xs">
                                {record.employeeName?.charAt(0) || "?"}
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-foreground">{record.employeeName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge 
                          variant={record.type === "entrada" ? "default" : "outline"} 
                          className={record.type === "entrada" ? "bg-green-500/20 text-green-500 hover:bg-green-500/30 border-green-500/20" : "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30 border-orange-500/20"}
                        >
                          <ArrowRightLeft className="w-3 h-3 mr-1" />
                          {record.type.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
