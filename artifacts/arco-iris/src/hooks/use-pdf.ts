import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/utils";
import type { PatientPdfData } from "@workspace/api-client-react";

export const generatePatientPdf = (data: PatientPdfData) => {
  const doc = new jsPDF();
  const { patient, professional, absenceCount, totalAppointments, lastAppointmentDate } = data;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(24, 118, 107); // Teal primary color
  doc.text("NFs gestão Terapêutica", 14, 20);
  
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.text("Ficha do Paciente", 14, 30);

  // Patient Info
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const startY = 40;
  const lineH = 7;

  doc.text(`Nome: ${patient.name}`, 14, startY);
  doc.text(`Data de Nascimento: ${formatDate(patient.dateOfBirth)}`, 14, startY + lineH);
  doc.text(`CPF: ${patient.cpf || "-"}`, 14, startY + lineH * 2);
  doc.text(`Telefone: ${patient.phone || "-"}`, 14, startY + lineH * 3);
  doc.text(`Responsável: ${patient.guardianName || "-"} (${patient.guardianPhone || "-"})`, 14, startY + lineH * 4);
  
  doc.text(`Profissional: ${professional?.name || "Não atribuído"}`, 14, startY + lineH * 6);
  doc.text(`Diagnóstico: ${patient.diagnosis || "Não informado"}`, 14, startY + lineH * 7);
  doc.text(`Status: ${patient.status.toUpperCase()}`, 14, startY + lineH * 8);

  // Stats Table
  autoTable(doc, {
    startY: startY + lineH * 10,
    head: [["Estatísticas", "Valor"]],
    body: [
      ["Total de Consultas", totalAppointments.toString()],
      ["Faltas Registradas", absenceCount.toString()],
      ["Última Consulta", formatDate(lastAppointmentDate)],
    ],
    headStyles: { fillColor: [24, 118, 107] },
    theme: "striped"
  });

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(`Gerado em ${formatDate(new Date().toISOString(), "dd/MM/yyyy HH:mm")} por NFs gestão`, 14, doc.internal.pageSize.height - 10);

  doc.save(`paciente-${patient.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
};
