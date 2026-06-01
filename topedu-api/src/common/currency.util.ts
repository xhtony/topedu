import { Currency } from '@prisma/client';

export function getCourseFee(
  course: { feeCny: unknown; feeNzd: unknown },
  walletCurrency: Currency,
): number {
  return walletCurrency === Currency.CNY ? Number(course.feeCny) : Number(course.feeNzd);
}

export function computeStudentBalance(prepayment: number, totalAttendanceFees: number): number {
  return Number(prepayment) - Number(totalAttendanceFees);
}

export function formatCurrencyAmount(amount: number, currency: Currency | null | undefined): string {
  const value = Number(amount).toFixed(2);
  if (currency === Currency.CNY) return `¥${value}`;
  if (currency === Currency.NZD) return `NZ$${value}`;
  return value;
}

export type StudentWalletFields = {
  prepaymentCny: number;
  prepaymentNzd: number;
  balanceCny: number;
  balanceNzd: number;
};

export function resolveStudentPrepaymentInput(input: {
  prepaymentCny?: number;
  prepaymentNzd?: number;
}): StudentWalletFields & { walletCurrency: Currency | null } {
  const prepaymentCny = Math.max(0, Number(input.prepaymentCny ?? 0));
  const prepaymentNzd = Math.max(0, Number(input.prepaymentNzd ?? 0));

  let walletCurrency: Currency | null = null;
  if (prepaymentCny > 0 && prepaymentNzd > 0) {
    walletCurrency = Currency.CNY;
  } else if (prepaymentCny > 0) {
    walletCurrency = Currency.CNY;
  } else if (prepaymentNzd > 0) {
    walletCurrency = Currency.NZD;
  }

  return {
    walletCurrency,
    prepaymentCny,
    prepaymentNzd,
    balanceCny: prepaymentCny,
    balanceNzd: prepaymentNzd,
  };
}

export function computeDualStudentBalances(
  prepaymentCny: number,
  prepaymentNzd: number,
  feesCny: number,
  feesNzd: number,
): { balanceCny: number; balanceNzd: number } {
  return {
    balanceCny: computeStudentBalance(prepaymentCny, feesCny),
    balanceNzd: computeStudentBalance(prepaymentNzd, feesNzd),
  };
}

export function mapStudentWalletResponse(
  user: {
    prepaymentCny: unknown;
    prepaymentNzd: unknown;
    walletCurrency?: Currency | null;
  },
  feesCny: number,
  feesNzd: number,
  attendanceCountCny = 0,
  attendanceCountNzd = 0,
) {
  const prepaymentCny = Number(user.prepaymentCny ?? 0);
  const prepaymentNzd = Number(user.prepaymentNzd ?? 0);
  const balances = computeDualStudentBalances(prepaymentCny, prepaymentNzd, feesCny, feesNzd);
  return {
    walletCurrency: user.walletCurrency ?? null,
    prepaymentCny,
    prepaymentNzd,
    balanceCny: balances.balanceCny,
    balanceNzd: balances.balanceNzd,
    totalAttendanceFeesCny: feesCny,
    totalAttendanceFeesNzd: feesNzd,
    attendanceCountCny,
    attendanceCountNzd,
    attendanceCount: attendanceCountCny + attendanceCountNzd,
    totalAttendanceFees: feesCny + feesNzd,
  };
}

export type BillingCurrencySelectionReason =
  | 'REQUESTED'
  | 'ONLY_CNY_WALLET'
  | 'ONLY_NZD_WALLET'
  | 'SUFFICIENT_BALANCE_CNY'
  | 'SUFFICIENT_BALANCE_NZD'
  | 'MAX_REMAINING_CNY'
  | 'MAX_REMAINING_NZD'
  | 'MIN_OVERDRAFT_CNY'
  | 'MIN_OVERDRAFT_NZD'
  | 'WALLET_CURRENCY_DEFAULT'
  | 'FALLBACK_CNY';

export function resolveCheckInBillingCurrency(
  user: {
    walletCurrency: Currency | null;
    prepaymentCny: number;
    prepaymentNzd: number;
    balanceCny: number;
    balanceNzd: number;
  },
  fees: { feeCny: number; feeNzd: number },
  requested?: Currency,
): { currency: Currency; reason: BillingCurrencySelectionReason } {
  if (requested) {
    return { currency: requested, reason: 'REQUESTED' };
  }

  const cnyEligible = user.prepaymentCny > 0;
  const nzdEligible = user.prepaymentNzd > 0;

  if (cnyEligible && !nzdEligible) {
    return { currency: Currency.CNY, reason: 'ONLY_CNY_WALLET' };
  }
  if (nzdEligible && !cnyEligible) {
    return { currency: Currency.NZD, reason: 'ONLY_NZD_WALLET' };
  }

  if (cnyEligible && nzdEligible) {
    const { feeCny, feeNzd } = fees;
    const cnyCanPay = user.balanceCny >= feeCny;
    const nzdCanPay = user.balanceNzd >= feeNzd;

    if (cnyCanPay && !nzdCanPay) {
      return { currency: Currency.CNY, reason: 'SUFFICIENT_BALANCE_CNY' };
    }
    if (nzdCanPay && !cnyCanPay) {
      return { currency: Currency.NZD, reason: 'SUFFICIENT_BALANCE_NZD' };
    }

    if (cnyCanPay && nzdCanPay) {
      const remainingCny = user.balanceCny - feeCny;
      const remainingNzd = user.balanceNzd - feeNzd;
      if (remainingCny > remainingNzd) {
        return { currency: Currency.CNY, reason: 'MAX_REMAINING_CNY' };
      }
      if (remainingNzd > remainingCny) {
        return { currency: Currency.NZD, reason: 'MAX_REMAINING_NZD' };
      }
    } else if (!cnyCanPay && !nzdCanPay) {
      if (user.balanceCny > user.balanceNzd) {
        return { currency: Currency.CNY, reason: 'MIN_OVERDRAFT_CNY' };
      }
      if (user.balanceNzd > user.balanceCny) {
        return { currency: Currency.NZD, reason: 'MIN_OVERDRAFT_NZD' };
      }
    }
  }

  if (user.walletCurrency) {
    return { currency: user.walletCurrency, reason: 'WALLET_CURRENCY_DEFAULT' };
  }
  return { currency: Currency.CNY, reason: 'FALLBACK_CNY' };
}
