import { jsPDF } from 'jspdf';

const BRAND_CYAN = [34, 211, 238];
const DARK_BG = [2, 6, 23];
const SECTION_HEADERS = [
  'INCIDENT REPORT',
  'EXECUTIVE SUMMARY',
  'DISRUPTION DETAILS',
  'FINANCIAL IMPACT ASSESSMENT',
  'RESOLUTION EXECUTED',
  'ALTERNATIVE OPTIONS CONSIDERED',
  'RISK OUTLOOK',
  'RECOMMENDED NEXT STEPS',
];

export function generateReportPdf({ reportText, disruption, traceId }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = 210;
  const height = 297;
  const margin = 20;
  const contentWidth = width - margin * 2;

  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, width, 38, 'F');

  doc.setFillColor(...BRAND_CYAN);
  doc.rect(0, 36, width, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('OpenTrade', margin, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_CYAN);
  doc.text('AUTONOMOUS SUPPLY CHAIN INTELLIGENCE', margin, 23);

  doc.setTextColor(180, 200, 220);
  doc.setFontSize(8);
  const now = new Date();
  doc.text(`Generated: ${now.toLocaleString()}`, width - margin, 14, { align: 'right' });
  doc.text(`Trace ID: ${traceId || 'N/A'}`, width - margin, 21, { align: 'right' });
  doc.text(`Severity: ${disruption?.severity != null ? `${disruption.severity}/10` : 'HIGH'}`, width - margin, 28, { align: 'right' });

  let y = 50;
  const lines = String(reportText || '').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      y += 3;
      continue;
    }

    const isHeader = SECTION_HEADERS.some((h) => line.toUpperCase().startsWith(h));

    if (isHeader) {
      if (y > height - 40) {
        doc.addPage();
        y = 20;
      }
      if (y > 55) y += 4;

      doc.setFillColor(...BRAND_CYAN);
      doc.rect(margin, y - 4, 3, 8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...DARK_BG);
      doc.text(line, margin + 6, y + 1);
      y += 10;

      doc.setDrawColor(...BRAND_CYAN);
      doc.setLineWidth(0.3);
      doc.line(margin, y - 3, width - margin, y - 3);
      y += 3;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 60);
      const wrapped = doc.splitTextToSize(line, contentWidth - 6);
      for (const wrappedLine of wrapped) {
        if (y > height - 20) {
          doc.addPage();
          y = 20;
        }
        doc.text(wrappedLine, margin + 6, y);
        y += 5;
      }
      y += 1;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFillColor(...DARK_BG);
    doc.rect(0, height - 12, width, 12, 'F');
    doc.setTextColor(...BRAND_CYAN);
    doc.setFontSize(7);
    doc.text('OPENTRADE — CONFIDENTIAL', margin, height - 5);
    doc.setTextColor(100, 130, 160);
    doc.text(`Page ${i} of ${totalPages}`, width - margin, height - 5, { align: 'right' });
  }

  return doc;
}
