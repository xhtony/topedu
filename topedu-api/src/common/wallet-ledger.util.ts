import { BillingSelectionReason, Currency, RecordSource, WalletRecordType } from '@prisma/client';

export function billingReasonLabel(reason: BillingSelectionReason | string | null | undefined): string {
  if (!reason) return '—';
  const labels: Record<string, string> = {
    REQUESTED: '指定币种',
    ONLY_CNY_WALLET: '仅人民币预存',
    ONLY_NZD_WALLET: '仅纽币预存',
    SUFFICIENT_BALANCE_CNY: '人民币余额充足',
    SUFFICIENT_BALANCE_NZD: '纽币余额充足',
    MAX_REMAINING_CNY: '扣人民币剩余更多',
    MAX_REMAINING_NZD: '扣纽币剩余更多',
    MIN_OVERDRAFT_CNY: '人民币透支更少',
    MIN_OVERDRAFT_NZD: '纽币透支更少',
    WALLET_CURRENCY_DEFAULT: '默认钱包币种',
    FALLBACK_CNY: '默认人民币',
  };
  return labels[reason] ?? reason;
}

export function recordSourceLabel(source: RecordSource | string | null | undefined): string {
  if (source === RecordSource.ADMIN || source === 'ADMIN') return 'Admin';
  if (source === RecordSource.STUDENT || source === 'STUDENT') return 'Student';
  if (source === RecordSource.SYSTEM || source === 'SYSTEM') return 'System';
  return source ? String(source) : '—';
}

export type RechargeRecordRow = {
  id: string;
  amount: number;
  currency: Currency;
  prepaymentAfter: number;
  note: string | null;
  recordType: WalletRecordType;
  recordSource: RecordSource;
  batchId: string | null;
  relatedBatchId: string | null;
  balanceCnyAfter: number | null;
  balanceNzdAfter: number | null;
  createdAt: Date;
  createdBy: { id: string; username: string; name: string } | null;
};

export type RechargeBatchRow = {
  batchId: string | null;
  ids: string[];
  createdAt: Date;
  amountCny: number | null;
  amountNzd: number | null;
  prepaymentCnyAfter: number | null;
  prepaymentNzdAfter: number | null;
  balanceCnyAfter: number | null;
  balanceNzdAfter: number | null;
  note: string | null;
  recordType: WalletRecordType;
  relatedBatchId: string | null;
  recordSource: RecordSource;
  createdBy: { id: string; username: string; name: string } | null;
};

function isReversalRecord(r: { recordType: WalletRecordType; amount: number }): boolean {
  return r.recordType === WalletRecordType.REVERSAL || r.amount < 0;
}

export function groupRechargeRecordsIntoBatches(records: RechargeRecordRow[]): RechargeBatchRow[] {
  const batches: RechargeBatchRow[] = [];
  const byBatch = new Map<string, RechargeRecordRow[]>();

  for (const r of records) {
    const key = r.batchId ?? `legacy:${r.id}`;
    if (!byBatch.has(key)) byBatch.set(key, []);
    byBatch.get(key)!.push(r);
  }

  for (const [, rows] of byBatch) {
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const first = rows[0];
    let amountCny: number | null = null;
    let amountNzd: number | null = null;
    let prepaymentCnyAfter: number | null = null;
    let prepaymentNzdAfter: number | null = null;

    for (const r of rows) {
      if (r.currency === Currency.CNY) {
        amountCny = r.amount;
        prepaymentCnyAfter = r.prepaymentAfter;
      } else if (r.currency === Currency.NZD) {
        amountNzd = r.amount;
        prepaymentNzdAfter = r.prepaymentAfter;
      }
    }

    batches.push({
      batchId: first.batchId,
      ids: rows.map((r) => r.id),
      createdAt: first.createdAt,
      amountCny,
      amountNzd,
      prepaymentCnyAfter,
      prepaymentNzdAfter,
      balanceCnyAfter: first.balanceCnyAfter,
      balanceNzdAfter: first.balanceNzdAfter,
      note: first.note,
      recordType: first.recordType,
      relatedBatchId: first.relatedBatchId,
      recordSource: first.recordSource,
      createdBy: first.createdBy,
    });
  }

  batches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return batches;
}

export type FinancialLedgerItem = {
  id: string;
  type: 'RECHARGE' | 'REVERSAL' | 'CHECK_IN';
  direction: 'IN' | 'OUT';
  createdAt: Date;
  amountCny: number | null;
  amountNzd: number | null;
  currency: Currency | null;
  amount: number | null;
  detail: string;
  recordSource: RecordSource;
  billingSelectionReason: BillingSelectionReason | null;
  createdBy: { id: string; username: string; name: string } | null;
  batchId: string | null;
  balanceCnyAfter: number | null;
  balanceNzdAfter: number | null;
};

export function mapAttendanceToLedgerItem(a: {
  id: string;
  dateStr: string;
  currency: Currency;
  feeDeducted: unknown;
  balanceCnyAfter: unknown;
  balanceNzdAfter: unknown;
  courseName: string | null;
  recordSource: RecordSource;
  billingSelectionReason: BillingSelectionReason | null;
  createdAt: Date;
  createdBy: { id: string; username: string; name: string } | null;
}): FinancialLedgerItem {
  const fee = Number(a.feeDeducted);
  return {
    id: a.id,
    type: 'CHECK_IN',
    direction: 'OUT',
    createdAt: a.createdAt,
    amountCny: a.currency === Currency.CNY ? fee : null,
    amountNzd: a.currency === Currency.NZD ? fee : null,
    currency: a.currency,
    amount: fee,
    detail: `${a.courseName ?? 'Class'} · ${a.dateStr}`,
    recordSource: a.recordSource,
    billingSelectionReason: a.billingSelectionReason,
    createdBy: a.createdBy,
    batchId: null,
    balanceCnyAfter: Number(a.balanceCnyAfter),
    balanceNzdAfter: Number(a.balanceNzdAfter),
  };
}

function formatSignedLedgerAmount(value: number, currency: string): string {
  const sign = value < 0 ? '-' : '+';
  return `${sign}${Math.abs(value).toFixed(2)} ${currency}`;
}

export function mapRechargeBatchToLedgerItem(b: RechargeBatchRow): FinancialLedgerItem {
  const reversal =
    b.recordType === WalletRecordType.REVERSAL ||
    (b.amountCny != null && b.amountCny < 0) ||
    (b.amountNzd != null && b.amountNzd < 0);

  return {
    id: b.ids[0],
    type: reversal ? 'REVERSAL' : 'RECHARGE',
    direction: reversal ? 'OUT' : 'IN',
    createdAt: b.createdAt,
    amountCny: b.amountCny,
    amountNzd: b.amountNzd,
    currency: null,
    amount: null,
    detail: b.note
      ? reversal
        ? `Reversal · ${b.note}`
        : `Recharge · ${b.note}`
      : reversal
        ? 'Reversal'
        : 'Recharge',
    recordSource: b.recordSource,
    billingSelectionReason: null,
    createdBy: b.createdBy,
    batchId: b.batchId,
    balanceCnyAfter: b.balanceCnyAfter,
    balanceNzdAfter: b.balanceNzdAfter,
  };
}

export function formatRechargeBatchLedgerAmount(b: {
  amountCny: number | null;
  amountNzd: number | null;
}): string {
  const parts: string[] = [];
  if (b.amountCny != null && Math.abs(b.amountCny) >= 0.01) {
    parts.push(formatSignedLedgerAmount(b.amountCny, 'CNY'));
  }
  if (b.amountNzd != null && Math.abs(b.amountNzd) >= 0.01) {
    parts.push(formatSignedLedgerAmount(b.amountNzd, 'NZD'));
  }
  return parts.length ? parts.join(', ') : '—';
}

export { isReversalRecord };
