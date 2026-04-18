import { useGetPontoEmployees } from "@/lib/ponto-hooks";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Badge, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Badge as UiBadge } from "@/components/ui/badge";

export default function EmployeesList() {
  const { data: employees = [], isLoading } = useGetPontoEmployees();
  const [search, setSearch] = useState("");

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(search.toLowerCase()) || 
    emp.cpf.includes(search) ||
    emp.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Funcionários</h1>
          <p className="text-muted-foreground">Gerencie o cadastro da equipe e gere crachás.</p>
        </div>
        <Link href="/admin/employees/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Novo Funcionário
          </Button>
        </Link>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome, CPF ou cargo..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm bg-background/50 border-white/10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-full h-16 bg-muted/50 animate-pulse rounded-lg"></div>
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum funcionário encontrado.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/30 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 font-medium">Funcionário</th>
                      <th className="px-6 py-4 font-medium">CPF</th>
                      <th className="px-6 py-4 font-medium">Cargo</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
                              {emp.photo ? (
                                <img src={emp.photo} alt={emp.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-lg font-medium text-muted-foreground">
                                  {emp.name.charAt(0)}
                                </div>
                              )}
                            </div>
                            <span className="font-medium text-foreground">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{emp.cpf}</td>
                        <td className="px-6 py-4 text-muted-foreground">{emp.role}</td>
                        <td className="px-6 py-4">
                          <UiBadge variant={emp.active ? "default" : "destructive"} className="bg-opacity-20">
                            {emp.active ? "Ativo" : "Inativo"}
                          </UiBadge>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <Link href={`/admin/employees/${emp.id}/badge`}>
                            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                              <Badge className="w-4 h-4 mr-2" />
                              Crachá
                            </Button>
                          </Link>
                          <Link href={`/admin/employees/${emp.id}`}>
                            <Button variant="outline" size="sm" className="border-white/10">
                              Editar
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
