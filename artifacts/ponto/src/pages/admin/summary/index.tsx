import { useState } from "react";
import { useGetPontoSummary } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Clock } from "lucide-react";

export default function SummaryList() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: summaries = [], isLoading } = useGetPontoSummary({
    date: date || undefined
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Resumo do Dia</h1>
        <p className="text-muted-foreground">Visão consolidada das horas trabalhadas no dia.</p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            <Input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="bg-background/50 border-white/10 w-[200px]"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {[...Array(4)].map((_, i) => (
                 <div key={i} className="w-full h-32 bg-muted/50 animate-pulse rounded-xl"></div>
               ))}
             </div>
          ) : summaries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum registro para este dia.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {summaries.map((summary) => (
                <div key={summary.employeeId} className="bg-background/40 border border-white/10 rounded-xl p-5 flex flex-col gap-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-secondary border-2 border-border flex-shrink-0 shadow-sm">
                      {summary.employeePhoto ? (
                        <img src={summary.employeePhoto} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-medium text-muted-foreground">
                          {summary.employeeName?.charAt(0) || "?"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-foreground leading-tight">{summary.employeeName}</h3>
                      <p className="text-sm text-primary font-medium">{summary.role}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 text-lg font-mono font-semibold bg-primary/10 text-primary px-3 py-1 rounded-lg border border-primary/20">
                        <Clock className="w-4 h-4" />
                        {summary.totalHours || "00:00"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Horas Totais</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Marcações</p>
                    <div className="flex flex-wrap gap-2">
                      {summary.records.length > 0 ? (
                        summary.records.sort((a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime()).map((rec, i) => (
                          <Badge 
                            key={i} 
                            variant="outline" 
                            className={`font-mono text-xs ${
                              rec.type === 'entrada' 
                                ? 'border-green-500/30 text-green-400 bg-green-500/5' 
                                : 'border-orange-500/30 text-orange-400 bg-orange-500/5'
                            }`}
                          >
                            {rec.type === 'entrada' ? 'E' : 'S'}: {format(new Date(rec.punchedAt), "HH:mm")}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Sem marcações</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
