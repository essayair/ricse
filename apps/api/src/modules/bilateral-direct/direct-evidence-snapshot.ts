import { Prisma } from '@prisma/client';
import { readMeasuredPct } from '../contract/grade-price-rules';

interface Ticket {
  id: string; ticketNo: string; weighingStage: string; netWeight: unknown;
  grossWeight?: unknown; tareWeight?: unknown; updatedAt?: Date;
  weightSelections: Array<{ purpose: string; weighTicketId: string }>;
}
interface Report {
  id: string; reportNo?: string | null; inspectionNo: string; evidenceStage: string;
  institutionName?: string | null; updatedAt?: Date; status: string; deletedAt?: Date | null;
  indicators: Array<{ code: string; name: string; measuredValue?: unknown; unit?: string | null }>;
}
const decimal = (value: unknown) => value == null ? null : new Prisma.Decimal(String(value)).toString();

/** 不读取当前时间；复核时可稳定比对，证据不足不擅自挑选同侧多张凭证。 */
export function directEvidenceSnapshot(tickets: Ticket[], reports: Report[], finalReportId: string) {
  const side = (stage: string) => {
    const peers = tickets.filter(t => t.weighingStage === stage);
    const selected = peers.flatMap(t => t.weightSelections).find(s => s.purpose === stage);
    const ticket = selected ? peers.find(t => t.id === selected.weighTicketId) : peers.length === 1 ? peers[0] : undefined;
    return {
      selectionRequired: peers.length > 1 && !ticket,
      ticket: ticket ? { id: ticket.id, ticketNo: ticket.ticketNo, netWeight: decimal(ticket.netWeight), grossWeight: decimal(ticket.grossWeight), tareWeight: decimal(ticket.tareWeight), updatedAt: ticket.updatedAt?.toISOString() || null } : null,
      reports: reports.filter(r => r.evidenceStage === stage && r.status === 'CONFIRMED' && !r.deletedAt).sort((a, b) => a.id.localeCompare(b.id)).map(r => ({
        id: r.id, reportNo: r.reportNo || r.inspectionNo, institutionName: r.institutionName || null,
        finalAdopted: r.id === finalReportId, updatedAt: r.updatedAt?.toISOString() || null,
        gradePct: readMeasuredPct(r.indicators as any, 'GRADE'), moisturePct: readMeasuredPct(r.indicators as any, 'MOISTURE'),
      })),
    };
  };
  const shipping = side('SHIPPING'), receiving = side('RECEIVING');
  const weightVariance = shipping.ticket?.netWeight != null && receiving.ticket?.netWeight != null
    ? new Prisma.Decimal(receiving.ticket.netWeight).minus(shipping.ticket.netWeight).toDecimalPlaces(3).toString() : null;
  return { version: 1, shipping, receiving, weightVariance };
}
