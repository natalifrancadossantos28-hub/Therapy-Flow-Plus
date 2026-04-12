import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useGetPontoEmployee } from "@workspace/api-client-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function EmployeeBadge() {
  const { id } = useParams();
  const { data: employee, isLoading } = useGetPontoEmployee(parseInt(id || "0", 10), {
    query: { enabled: !!id }
  });
  
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  useEffect(() => {
    if (employee?.cpf) {
      QRCode.toDataURL(employee.cpf, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }).then(setQrCodeUrl);
    }
  }, [employee?.cpf]);

  if (isLoading) return <div>Carregando...</div>;
  if (!employee) return <div>Funcionário não encontrado</div>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/admin/employees">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Crachá</h1>
            <p className="text-muted-foreground">Imprima o crachá para registro de ponto.</p>
          </div>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Imprimir Crachá
        </Button>
      </div>

      <div className="flex justify-center p-8 bg-muted/30 rounded-2xl print:bg-transparent print:p-0">
        <Card className="w-[340px] h-[540px] relative overflow-hidden bg-white border-2 border-gray-200 shadow-xl print:shadow-none print:border-gray-300 mx-auto rounded-xl flex flex-col">
          {/* Header */}
          <div className="h-24 bg-blue-950 flex flex-col items-center justify-center pt-2">
            <h2 className="text-white font-display font-bold text-xl tracking-wide">NFs Gestão</h2>
            <p className="text-blue-200 text-xs tracking-widest font-medium uppercase">TERAPÊUTICA</p>
          </div>
          
          {/* Content */}
          <div className="flex-1 flex flex-col items-center p-6 relative">
            <div className="absolute top-0 left-0 w-full h-12 bg-blue-950/5"></div>
            
            {/* Photo */}
            <div className="w-32 h-32 rounded-full border-4 border-white shadow-md overflow-hidden bg-gray-100 z-10 -mt-14 mb-4">
              {employee.photo ? (
                <img src={employee.photo} alt={employee.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400 font-display">
                  {employee.name.charAt(0)}
                </div>
              )}
            </div>

            {/* Info */}
            <h3 className="text-xl font-bold text-gray-900 text-center leading-tight mb-1">
              {employee.name}
            </h3>
            <p className="text-sm font-semibold text-blue-600 mb-6 uppercase tracking-wider">
              {employee.role}
            </p>

            {/* QR Code */}
            <div className="mt-auto flex flex-col items-center">
              {qrCodeUrl && (
                <div className="p-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                  <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32" />
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-3 uppercase tracking-widest">Acesso de Ponto</p>
            </div>
          </div>
          
          {/* Footer Line */}
          <div className="h-2 bg-blue-600 w-full"></div>
        </Card>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          .glass-card {
            border: none;
            box-shadow: none;
            background: transparent;
          }
          .w-\\[340px\\] {
            visibility: visible;
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .w-\\[340px\\] * {
            visibility: visible;
          }
        }
      `}</style>
    </div>
  );
}
