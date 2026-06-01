import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma, RecordSource, WalletRecordType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StudentService } from '../student/student.service';
import { mapStudentWalletResponse, computeDualStudentBalances } from '../common/currency.util';
import {
  groupRechargeRecordsIntoBatches,
  mapAttendanceToLedgerItem,
  mapRechargeBatchToLedgerItem,
  billingReasonLabel,
  recordSourceLabel,
  type RechargeRecordRow,
} from '../common/wallet-ledger.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RechargeDto } from './dto/recharge.dto';
import { RechargeReversalDto } from './dto/recharge-reversal.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { SaveTimetableModuleDto } from './dto/save-timetable-module.dto';
import { SetUserEnrollmentSlotsDto } from './dto/set-user-enrollment-slots.dto';
import { CheckInDto } from '../student/dto/check-in.dto';
import { LeaveDto } from '../student/dto/leave.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService,
  ) {}

  /* ───────────── User Management ───────────── */

  async createUser(dto: CreateUserDto) {
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username.trim() },
    });
    if (existingUsername) throw new BadRequestException('Login Account already exists');

    const rawPassword = dto.password || '12345678';
    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const walletData = {
      walletCurrency: null as Currency | null,
      prepaymentCny: 0,
      prepaymentNzd: 0,
      balanceCny: 0,
      balanceNzd: 0,
    };

    const user = await this.prisma.user.create({
      data: {
        username: dto.username.trim(),
        email: dto.email ? dto.email.toLowerCase().trim() : null,
        name: dto.name.trim(),
        passwordHash,
        role: dto.role,
        gender: dto.gender ?? null,
        walletCurrency: walletData.walletCurrency,
        prepaymentCny: walletData.prepaymentCny,
        prepaymentNzd: walletData.prepaymentNzd,
        balanceCny: walletData.balanceCny,
        balanceNzd: walletData.balanceNzd,
        mustChangePassword: true,
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        gender: user.gender,
        walletCurrency: user.walletCurrency,
        prepaymentCny: Number(user.prepaymentCny),
        prepaymentNzd: Number(user.prepaymentNzd),
        balanceCny: Number(user.balanceCny),
        balanceNzd: Number(user.balanceNzd),
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  private readonly studentWalletSelect = {
    walletCurrency: true,
    prepaymentCny: true,
    prepaymentNzd: true,
    balanceCny: true,
    balanceNzd: true,
  } as const;

  private async getStudentDualAttendanceStats(userId: string) {
    const [cny, nzd] = await Promise.all([
      this.getStudentAttendanceStats(userId, Currency.CNY),
      this.getStudentAttendanceStats(userId, Currency.NZD),
    ]);
    return { cny, nzd };
  }

  private async buildStudentWalletPayload(
    userId: string,
    user: {
      walletCurrency: Currency | null;
      prepaymentCny: unknown;
      prepaymentNzd: unknown;
    },
  ) {
    const { cny, nzd } = await this.getStudentDualAttendanceStats(userId);
    return mapStudentWalletResponse(
      user,
      cny.totalAttendanceFees,
      nzd.totalAttendanceFees,
      cny.attendanceCount,
      nzd.attendanceCount,
    );
  }

  async getUsers(role?: string) {
    const where = role ? { role: role as any } : undefined;
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        gender: true,
        ...this.studentWalletSelect,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    const dualStatsByUser = new Map<
      string,
      Awaited<ReturnType<AdminService['getStudentDualAttendanceStats']>>
    >();
    for (const student of users.filter((u) => u.role === 'STUDENT')) {
      dualStatsByUser.set(student.id, await this.getStudentDualAttendanceStats(student.id));
    }

    return {
      users: users.map((u) => {
        if (u.role === 'STUDENT') {
          const stats = dualStatsByUser.get(u.id) ?? {
            cny: { totalAttendanceFees: 0, attendanceCount: 0 },
            nzd: { totalAttendanceFees: 0, attendanceCount: 0 },
          };
          return {
            ...u,
            ...mapStudentWalletResponse(
              u,
              stats.cny.totalAttendanceFees,
              stats.nzd.totalAttendanceFees,
              stats.cny.attendanceCount,
              stats.nzd.attendanceCount,
            ),
          };
        }
        return u;
      }),
    };
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('User not found');

    const emailNormalized = String(dto.email).toLowerCase().trim();

    const data: { name: string; email: string } = {
      name: dto.name.trim(),
      email: emailNormalized,
    };

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        gender: true,
        ...this.studentWalletSelect,
        mustChangePassword: true,
      },
    });

    const wallet =
      user.role === 'STUDENT' ? await this.buildStudentWalletPayload(userId, user) : null;

    return {
      success: true,
      user: {
        ...user,
        ...(wallet ?? {}),
      },
    };
  }

  async resetUserPassword(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash('12345678', 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
    });

    return {
      success: true,
      message: 'Password reset to default. User must change password on next login.',
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        gender: true,
        ...this.studentWalletSelect,
        mustChangePassword: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const wallet =
      user.role === 'STUDENT' ? await this.buildStudentWalletPayload(userId, user) : null;

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        scheduleSlot: {
          include: {
            course: {
              select: { id: true, name: true, type: true, feeCny: true, feeNzd: true },
            },
            module: { select: { id: true, startDate: true, endDate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      user: {
        ...user,
        ...(wallet ?? {}),
      },
      enrollments: enrollments.map((e) => ({
        id: e.id,
        status: e.status,
        createdAt: e.createdAt,
        slot: {
          id: e.scheduleSlot.id,
          weekday: e.scheduleSlot.weekday,
          startTime: this.minuteToTime(e.scheduleSlot.startMinute),
          endTime: this.minuteToTime(e.scheduleSlot.endMinute),
          course: this.mapCourseResponse(e.scheduleSlot.course),
          module: {
            id: e.scheduleSlot.module.id,
            startDate: this.formatDate(e.scheduleSlot.module.startDate),
            endDate: this.formatDate(e.scheduleSlot.module.endDate),
          },
        },
      })),
    };
  }

  async rechargeBalance(userId: string, dto: RechargeDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, ...this.studentWalletSelect },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only student accounts can be recharged');

    const amountCny = dto.amountCny != null ? Number(dto.amountCny) : 0;
    const amountNzd = dto.amountNzd != null ? Number(dto.amountNzd) : 0;
    if (amountCny < 0.01 && amountNzd < 0.01) {
      throw new BadRequestException('Enter at least one recharge amount (CNY or NZD)');
    }

    const note = dto.note?.trim() || null;
    const batchId = randomUUID();
    const increments: {
      prepaymentCny?: { increment: number };
      prepaymentNzd?: { increment: number };
      walletCurrency?: Currency;
    } = {};
    if (amountCny >= 0.01) {
      increments.prepaymentCny = { increment: amountCny };
    }
    if (amountNzd >= 0.01) {
      increments.prepaymentNzd = { increment: amountNzd };
    }
    if (amountCny >= 0.01 && amountNzd >= 0.01) {
      increments.walletCurrency = Currency.CNY;
    } else if (amountCny >= 0.01 && !user.walletCurrency) {
      increments.walletCurrency = Currency.CNY;
    } else if (amountNzd >= 0.01 && !user.walletCurrency) {
      increments.walletCurrency = Currency.NZD;
    }

    const records = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: increments,
        select: { ...this.studentWalletSelect },
      });

      const [cny, nzd] = await Promise.all([
        this.getStudentAttendanceStatsTx(tx, userId, Currency.CNY),
        this.getStudentAttendanceStatsTx(tx, userId, Currency.NZD),
      ]);
      const balances = computeDualStudentBalances(
        Number(updated.prepaymentCny),
        Number(updated.prepaymentNzd),
        cny.totalAttendanceFees,
        nzd.totalAttendanceFees,
      );

      await tx.user.update({
        where: { id: userId },
        data: {
          balanceCny: balances.balanceCny,
          balanceNzd: balances.balanceNzd,
        },
      });

      const createdRecords = [];
      if (amountCny >= 0.01) {
        createdRecords.push(
          await tx.rechargeRecord.create({
            data: {
              userId,
              amount: amountCny,
              currency: Currency.CNY,
              prepaymentAfter: Number(updated.prepaymentCny),
              balanceCnyAfter: balances.balanceCny,
              balanceNzdAfter: balances.balanceNzd,
              note,
              recordType: WalletRecordType.RECHARGE,
              recordSource: RecordSource.ADMIN,
              batchId,
              createdById: adminId,
            },
            include: { createdBy: { select: { id: true, username: true, name: true } } },
          }),
        );
      }
      if (amountNzd >= 0.01) {
        createdRecords.push(
          await tx.rechargeRecord.create({
            data: {
              userId,
              amount: amountNzd,
              currency: Currency.NZD,
              prepaymentAfter: Number(updated.prepaymentNzd),
              balanceCnyAfter: balances.balanceCny,
              balanceNzdAfter: balances.balanceNzd,
              note,
              recordType: WalletRecordType.RECHARGE,
              recordSource: RecordSource.ADMIN,
              batchId,
              createdById: adminId,
            },
            include: { createdBy: { select: { id: true, username: true, name: true } } },
          }),
        );
      }

      return { updated, createdRecords, balances };
    });

    const wallet = await this.buildStudentWalletPayload(userId, records.updated);

    const mappedRecords = records.createdRecords.map((r) => this.mapRechargeRecordRow(r));
    const batches = groupRechargeRecordsIntoBatches(mappedRecords);

    return {
      success: true,
      ...wallet,
      balanceCny: records.balances.balanceCny,
      balanceNzd: records.balances.balanceNzd,
      batchId,
      records: mappedRecords,
      batches: batches.map((b) => this.mapRechargeBatchResponse(b)),
    };
  }

  async reverseRechargeBalance(userId: string, dto: RechargeReversalDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, ...this.studentWalletSelect },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only student accounts can be adjusted');

    const amountCny = dto.amountCny != null ? Number(dto.amountCny) : 0;
    const amountNzd = dto.amountNzd != null ? Number(dto.amountNzd) : 0;
    if (amountCny < 0.01 && amountNzd < 0.01) {
      throw new BadRequestException('Enter at least one reversal amount (CNY or NZD)');
    }

    const prepaymentCny = Number(user.prepaymentCny);
    const prepaymentNzd = Number(user.prepaymentNzd);
    if (amountCny >= 0.01 && amountCny > prepaymentCny + 0.001) {
      throw new BadRequestException('CNY reversal exceeds current prepayment');
    }
    if (amountNzd >= 0.01 && amountNzd > prepaymentNzd + 0.001) {
      throw new BadRequestException('NZD reversal exceeds current prepayment');
    }

    const relatedBatchId = dto.relatedBatchId?.trim() || null;
    if (relatedBatchId) {
      const related = await this.prisma.rechargeRecord.findFirst({
        where: {
          userId,
          batchId: relatedBatchId,
          recordType: WalletRecordType.RECHARGE,
        },
      });
      if (!related) throw new BadRequestException('Related recharge batch not found');
    }

    const note = dto.note?.trim() || null;
    const batchId = randomUUID();
    const decrements: {
      prepaymentCny?: { decrement: number };
      prepaymentNzd?: { decrement: number };
    } = {};
    if (amountCny >= 0.01) decrements.prepaymentCny = { decrement: amountCny };
    if (amountNzd >= 0.01) decrements.prepaymentNzd = { decrement: amountNzd };

    const records = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: decrements,
        select: { ...this.studentWalletSelect },
      });

      const [cny, nzd] = await Promise.all([
        this.getStudentAttendanceStatsTx(tx, userId, Currency.CNY),
        this.getStudentAttendanceStatsTx(tx, userId, Currency.NZD),
      ]);
      const balances = computeDualStudentBalances(
        Number(updated.prepaymentCny),
        Number(updated.prepaymentNzd),
        cny.totalAttendanceFees,
        nzd.totalAttendanceFees,
      );

      await tx.user.update({
        where: { id: userId },
        data: {
          balanceCny: balances.balanceCny,
          balanceNzd: balances.balanceNzd,
        },
      });

      const createdRecords = [];
      if (amountCny >= 0.01) {
        createdRecords.push(
          await tx.rechargeRecord.create({
            data: {
              userId,
              amount: -amountCny,
              currency: Currency.CNY,
              prepaymentAfter: Number(updated.prepaymentCny),
              balanceCnyAfter: balances.balanceCny,
              balanceNzdAfter: balances.balanceNzd,
              note,
              recordType: WalletRecordType.REVERSAL,
              recordSource: RecordSource.ADMIN,
              batchId,
              relatedBatchId,
              createdById: adminId,
            },
            include: { createdBy: { select: { id: true, username: true, name: true } } },
          }),
        );
      }
      if (amountNzd >= 0.01) {
        createdRecords.push(
          await tx.rechargeRecord.create({
            data: {
              userId,
              amount: -amountNzd,
              currency: Currency.NZD,
              prepaymentAfter: Number(updated.prepaymentNzd),
              balanceCnyAfter: balances.balanceCny,
              balanceNzdAfter: balances.balanceNzd,
              note,
              recordType: WalletRecordType.REVERSAL,
              recordSource: RecordSource.ADMIN,
              batchId,
              relatedBatchId,
              createdById: adminId,
            },
            include: { createdBy: { select: { id: true, username: true, name: true } } },
          }),
        );
      }

      return { updated, createdRecords, balances };
    });

    const wallet = await this.buildStudentWalletPayload(userId, records.updated);
    const mappedRecords = records.createdRecords.map((r) => this.mapRechargeRecordRow(r));
    const batches = groupRechargeRecordsIntoBatches(mappedRecords);

    return {
      success: true,
      message: 'Reversal recorded successfully',
      ...wallet,
      balanceCny: records.balances.balanceCny,
      balanceNzd: records.balances.balanceNzd,
      batchId,
      records: mappedRecords,
      batches: batches.map((b) => this.mapRechargeBatchResponse(b)),
    };
  }

  private mapRechargeRecordRow(r: {
    id: string;
    amount: unknown;
    currency: Currency;
    prepaymentAfter: unknown;
    note: string | null;
    recordType: WalletRecordType;
    recordSource: RecordSource;
    batchId: string | null;
    relatedBatchId: string | null;
    balanceCnyAfter: unknown;
    balanceNzdAfter: unknown;
    createdAt: Date;
    createdBy: { id: string; username: string; name: string };
  }): RechargeRecordRow {
    return {
      id: r.id,
      amount: Number(r.amount),
      currency: r.currency,
      prepaymentAfter: Number(r.prepaymentAfter),
      note: r.note,
      recordType: r.recordType,
      recordSource: r.recordSource,
      batchId: r.batchId,
      relatedBatchId: r.relatedBatchId,
      balanceCnyAfter: r.balanceCnyAfter != null ? Number(r.balanceCnyAfter) : null,
      balanceNzdAfter: r.balanceNzdAfter != null ? Number(r.balanceNzdAfter) : null,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    };
  }

  private mapRechargeBatchResponse(b: ReturnType<typeof groupRechargeRecordsIntoBatches>[number]) {
    return {
      batchId: b.batchId,
      ids: b.ids,
      amountCny: b.amountCny,
      amountNzd: b.amountNzd,
      prepaymentCnyAfter: b.prepaymentCnyAfter,
      prepaymentNzdAfter: b.prepaymentNzdAfter,
      balanceCnyAfter: b.balanceCnyAfter,
      balanceNzdAfter: b.balanceNzdAfter,
      note: b.note,
      recordType: b.recordType,
      relatedBatchId: b.relatedBatchId,
      recordSource: b.recordSource,
      recordSourceLabel: recordSourceLabel(b.recordSource),
      createdAt: b.createdAt,
      createdBy: b.createdBy,
    };
  }

  async getRechargeRecords(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        name: true,
        username: true,
        ...this.studentWalletSelect,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only students have recharge records');

    const records = await this.prisma.rechargeRecord.findMany({
      where: { userId },
      include: {
        createdBy: { select: { id: true, username: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const wallet = await this.buildStudentWalletPayload(userId, user);
    const mappedRecords = records.map((r) => this.mapRechargeRecordRow(r));
    const batches = groupRechargeRecordsIntoBatches(mappedRecords);

    return {
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        ...wallet,
      },
      records: mappedRecords,
      batches: batches.map((b) => this.mapRechargeBatchResponse(b)),
    };
  }

  async getFinancialLedger(
    userId: string,
    filters?: { from?: string; to?: string; type?: 'IN' | 'OUT' | 'ALL' },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        name: true,
        username: true,
        ...this.studentWalletSelect,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only students have a financial ledger');

    const typeFilter = filters?.type ?? 'ALL';
    const fromDate = filters?.from ? this.parseDate(filters.from) : null;
    const toDate = filters?.to ? this.parseDate(filters.to) : null;

    const [allAttendances, allRechargeRecords] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { userId },
        include: {
          createdBy: { select: { id: true, username: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.rechargeRecord.findMany({
        where: { userId },
        include: {
          createdBy: { select: { id: true, username: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const attendanceItems = allAttendances.map((a) => {
      const item = mapAttendanceToLedgerItem({
        id: a.id,
        dateStr: this.formatDate(a.date),
        currency: a.currency,
        feeDeducted: a.feeDeducted,
        balanceCnyAfter: a.balanceCnyAfter,
        balanceNzdAfter: a.balanceNzdAfter,
        courseName: a.courseName,
        recordSource: a.recordSource,
        billingSelectionReason: a.billingSelectionReason,
        createdAt: a.createdAt,
        createdBy: a.createdBy,
      });
      return {
        ...item,
        billingSelectionReasonLabel: billingReasonLabel(a.billingSelectionReason),
        recordSourceLabel: recordSourceLabel(a.recordSource),
      };
    });

    const rechargeBatches = groupRechargeRecordsIntoBatches(
      allRechargeRecords.map((r) => this.mapRechargeRecordRow(r)),
    );
    const rechargeItems = rechargeBatches.map((b) => {
      const item = mapRechargeBatchToLedgerItem(b);
      return {
        ...item,
        billingSelectionReasonLabel: null,
        recordSourceLabel: recordSourceLabel(b.recordSource),
      };
    });

    let items = [...attendanceItems, ...rechargeItems];

    if (typeFilter === 'IN') {
      items = items.filter((item) => item.direction === 'IN');
    } else if (typeFilter === 'OUT') {
      items = items.filter((item) => item.direction === 'OUT');
    }

    if (fromDate || toDate) {
      items = items.filter((item) => {
        const t = item.createdAt.getTime();
        if (fromDate && t < fromDate.getTime()) return false;
        if (toDate && t > toDate.getTime()) return false;
        return true;
      });
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const wallet = await this.buildStudentWalletPayload(userId, user);

    return {
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        ...wallet,
        balanceCny: Number(user.balanceCny),
        balanceNzd: Number(user.balanceNzd),
      },
      items,
    };
  }

  async getWalletReconciliation(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        ...this.studentWalletSelect,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only students have wallet reconciliation');

    const { cny, nzd } = await this.getStudentDualAttendanceStats(userId);
    const prepaymentCny = Number(user.prepaymentCny);
    const prepaymentNzd = Number(user.prepaymentNzd);
    const computed = computeDualStudentBalances(
      prepaymentCny,
      prepaymentNzd,
      cny.totalAttendanceFees,
      nzd.totalAttendanceFees,
    );

    const stored = {
      prepaymentCny,
      prepaymentNzd,
      balanceCny: Number(user.balanceCny),
      balanceNzd: Number(user.balanceNzd),
    };

    const consistent =
      Math.abs(stored.balanceCny - computed.balanceCny) < 0.01 &&
      Math.abs(stored.balanceNzd - computed.balanceNzd) < 0.01;

    return {
      stored,
      computed: {
        prepaymentCny,
        prepaymentNzd,
        balanceCny: computed.balanceCny,
        balanceNzd: computed.balanceNzd,
      },
      consistent,
      counts: {
        attendanceCny: cny.attendanceCount,
        attendanceNzd: nzd.attendanceCount,
      },
      totals: {
        feesCny: cny.totalAttendanceFees,
        feesNzd: nzd.totalAttendanceFees,
      },
    };
  }

  async getUserEnrollmentSlots(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only students have course enrollments');

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: ['APPROVED', 'PENDING'] } },
      select: { scheduleSlotId: true },
    });

    return { slotIds: enrollments.map((e) => e.scheduleSlotId) };
  }

  async getUserTimetableModules(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'TEACHER') {
      return this.getTeacherTimetableModules(userId);
    }
    if (user.role !== 'STUDENT') {
      return {
        weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        modules: [],
      };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED', 'REJECTED', 'ENDED'] },
      },
      include: {
        scheduleSlot: {
          include: {
            course: {
              include: { teacher: { select: { id: true, username: true, name: true } } },
            },
            module: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    type Cell = {
      slotId?: string;
      courseName?: string;
      selectionStatus?: string;
      selectionId?: string;
    };

    const byModule = new Map<string, typeof enrollments>();
    for (const e of enrollments) {
      const mid = e.scheduleSlot.moduleId;
      if (!byModule.has(mid)) byModule.set(mid, []);
      byModule.get(mid)!.push(e);
    }

    const modules: {
      id: string;
      startDate: string;
      endDate: string;
      rows: { startTime: string; endTime: string; cells: Cell[] }[];
    }[] = [];

    for (const [, list] of byModule) {
      const mod = list[0].scheduleSlot.module;
      const timeMap = new Map<string, { startMinute: number; endMinute: number; cells: Cell[] }>();
      const emptyCells = (): Cell[] => Array.from({ length: 7 }, () => ({ courseName: '-' }));

      for (const e of list) {
        const s = e.scheduleSlot;
        const key = `${s.startMinute}-${s.endMinute}`;
        if (!timeMap.has(key)) {
          timeMap.set(key, {
            startMinute: s.startMinute,
            endMinute: s.endMinute,
            cells: emptyCells(),
          });
        }
        const row = timeMap.get(key)!;
        const dayIdx = s.weekday - 1;
        if (dayIdx >= 0 && dayIdx < 7) {
          row.cells[dayIdx] = {
            slotId: s.id,
            courseName: this.courseLineLabel(s.course),
            selectionStatus: e.status,
            selectionId: e.id,
          };
        }
      }

      const rows = Array.from(timeMap.values())
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((r) => ({
          startTime: this.minuteToTime(r.startMinute),
          endTime: this.minuteToTime(r.endMinute),
          cells: r.cells,
        }));

      modules.push({
        id: mod.id,
        startDate: this.formatDate(mod.startDate),
        endDate: this.formatDate(mod.endDate),
        rows,
      });
    }

    modules.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return {
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      modules,
    };
  }

  private async getTeacherTimetableModules(teacherId: string) {
    const slots = await this.prisma.scheduleSlot.findMany({
      where: { course: { teacherId } },
      include: {
        course: { select: { id: true, name: true, type: true } },
        module: true,
      },
      orderBy: [{ module: { startDate: 'asc' } }, { startMinute: 'asc' }],
    });

    type Cell = {
      slotId?: string;
      courseName?: string;
    };

    const byModule = new Map<string, typeof slots>();
    for (const slot of slots) {
      const mid = slot.moduleId;
      if (!byModule.has(mid)) byModule.set(mid, []);
      byModule.get(mid)!.push(slot);
    }

    const modules: {
      id: string;
      startDate: string;
      endDate: string;
      rows: { startTime: string; endTime: string; cells: Cell[] }[];
    }[] = [];

    for (const [, list] of byModule) {
      const mod = list[0].module;
      const timeMap = new Map<string, { startMinute: number; endMinute: number; cells: Cell[] }>();
      const emptyCells = (): Cell[] => Array.from({ length: 7 }, () => ({ courseName: '-' }));

      for (const slot of list) {
        const key = `${slot.startMinute}-${slot.endMinute}`;
        if (!timeMap.has(key)) {
          timeMap.set(key, {
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
            cells: emptyCells(),
          });
        }
        const row = timeMap.get(key)!;
        const dayIdx = slot.weekday - 1;
        if (dayIdx >= 0 && dayIdx < 7) {
          row.cells[dayIdx] = {
            slotId: slot.id,
            courseName: slot.course.name,
          };
        }
      }

      const rows = Array.from(timeMap.values())
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((r) => ({
          startTime: this.minuteToTime(r.startMinute),
          endTime: this.minuteToTime(r.endMinute),
          cells: r.cells,
        }));

      modules.push({
        id: mod.id,
        startDate: this.formatDate(mod.startDate),
        endDate: this.formatDate(mod.endDate),
        rows,
      });
    }

    modules.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return {
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      modules,
    };
  }

  async getUserSessionList(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, name: true, username: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only students have class records');

    const sessionData = await this.studentService.getSessionList(userId);
    return {
      user: { id: user.id, name: user.name, username: user.username },
      ...sessionData,
    };
  }

  async adminCheckIn(userId: string, dto: CheckInDto, adminId: string) {
    await this.ensureStudentUser(userId);
    return this.studentService.checkIn(userId, dto, {
      admin: true,
      operatorId: adminId,
      recordSource: RecordSource.ADMIN,
    });
  }

  async adminRequestLeave(userId: string, dto: LeaveDto) {
    await this.ensureStudentUser(userId);
    return this.studentService.requestLeave(userId, dto, { admin: true });
  }

  private async ensureStudentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only students can have attendance recorded');
  }

  async setUserEnrollmentSlots(userId: string, dto: SetUserEnrollmentSlotsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'STUDENT') throw new BadRequestException('Only students can be enrolled in timetable slots');

    const slotIds = [...new Set((dto.slotIds || []).filter(Boolean))];

    await this.prisma.$transaction(async (tx) => {
      const toRemoveWhere =
        slotIds.length === 0
          ? { userId }
          : { userId, scheduleSlotId: { notIn: slotIds } };

      const toRemove = await tx.enrollment.findMany({
        where: toRemoveWhere,
        select: { id: true, scheduleSlotId: true },
      });

      for (const row of toRemove) {
        const attCount = await tx.attendance.count({
          where: { userId, scheduleSlotId: row.scheduleSlotId },
        });
        if (attCount > 0) {
          await tx.enrollment.update({
            where: { id: row.id },
            data: { status: 'ENDED' },
          });
        } else {
          await tx.enrollment.delete({ where: { id: row.id } });
        }
      }

      if (slotIds.length === 0) {
        return;
      }

      const slots = await tx.scheduleSlot.findMany({
        where: { id: { in: slotIds } },
        select: { id: true },
      });
      if (slots.length !== slotIds.length) {
        throw new BadRequestException('One or more schedule slots are invalid');
      }

      for (const sid of slotIds) {
        const existing = await tx.enrollment.findUnique({
          where: { userId_scheduleSlotId: { userId, scheduleSlotId: sid } },
        });
        if (existing) {
          if (existing.status === 'ENDED' || existing.status === 'REJECTED') {
            await tx.enrollment.update({
              where: { id: existing.id },
              data: { status: 'APPROVED' },
            });
          } else if (existing.status !== 'APPROVED') {
            await tx.enrollment.update({
              where: { id: existing.id },
              data: { status: 'APPROVED' },
            });
          }
        } else {
          await tx.enrollment.create({
            data: { userId, scheduleSlotId: sid, status: 'APPROVED' },
          });
        }
      }
    });

    return { success: true };
  }

  /* ───────────── Course Management ───────────── */

  async getCourses() {
    const courses = await this.prisma.course.findMany({
      include: { teacher: { select: { id: true, username: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      courses: courses.map((c) => this.mapCourseResponse(c)),
    };
  }

  async createCourse(dto: CreateCourseDto) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: dto.teacherId },
      select: { id: true, role: true },
    });
    if (!teacher || teacher.role !== 'TEACHER') throw new BadRequestException('Invalid teacher');

    const duplicate = await this.prisma.course.findFirst({
      where: { name: dto.name.trim(), teacherId: dto.teacherId },
    });
    if (duplicate) throw new BadRequestException('A course with the same name and teacher already exists');

    const course = await this.prisma.course.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        feeCny: dto.feeCny,
        feeNzd: dto.feeNzd,
        teacherId: dto.teacherId,
      },
      include: { teacher: { select: { id: true, username: true, name: true } } },
    });

    return {
      success: true,
      course: this.mapCourseResponse(course),
    };
  }

  async updateCourse(courseId: string, dto: UpdateCourseDto) {
    const existing = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!existing) throw new NotFoundException('Course not found');

    if (dto.teacherId) {
      const teacher = await this.prisma.user.findUnique({
        where: { id: dto.teacherId },
        select: { id: true, role: true },
      });
      if (!teacher || teacher.role !== 'TEACHER') throw new BadRequestException('Invalid teacher');
    }

    const finalName = dto.name !== undefined ? dto.name.trim() : existing.name;
    const finalTeacherId = dto.teacherId !== undefined ? dto.teacherId : existing.teacherId;
    const duplicate = await this.prisma.course.findFirst({
      where: { name: finalName, teacherId: finalTeacherId, id: { not: courseId } },
    });
    if (duplicate) throw new BadRequestException('A course with the same name and teacher already exists');

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.feeCny !== undefined) data.feeCny = dto.feeCny;
    if (dto.feeNzd !== undefined) data.feeNzd = dto.feeNzd;
    if (dto.teacherId !== undefined) data.teacherId = dto.teacherId;

    const course = await this.prisma.course.update({
      where: { id: courseId },
      data,
      include: { teacher: { select: { id: true, username: true, name: true } } },
    });

    return {
      success: true,
      course: this.mapCourseResponse(course),
    };
  }

  async deleteCourse(courseId: string) {
    const existing = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!existing) throw new NotFoundException('Course not found');

    const slotCount = await this.prisma.scheduleSlot.count({ where: { courseId } });
    if (slotCount > 0) throw new BadRequestException('Course is used in timetable and cannot be deleted');

    await this.prisma.course.delete({ where: { id: courseId } });
    return { success: true };
  }

  /* ───────────── Timetable Module Management ───────────── */

  async getTimetableModules() {
    const modules = await this.prisma.timetableModule.findMany({
      orderBy: { startDate: 'asc' },
      include: {
        scheduleSlots: {
          include: {
            course: {
              include: {
                teacher: { select: { id: true, username: true, name: true } },
              },
            },
          },
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        },
      },
    });

    return {
      modules: modules.map((m) => ({
        id: m.id,
        name: m.name,
        startDate: this.formatDate(m.startDate),
        endDate: this.formatDate(m.endDate),
        slots: m.scheduleSlots.map((s) => ({
          id: s.id,
          weekday: s.weekday,
          startTime: this.minuteToTime(s.startMinute),
          endTime: this.minuteToTime(s.endMinute),
          course: {
            ...this.mapCourseResponse(s.course),
            teacher: s.course.teacher,
          },
        })),
      })),
    };
  }

  async createTimetableModule(dto: SaveTimetableModuleDto) {
    const startDate = this.parseDate(dto.startDate);
    const endDate = this.parseDate(dto.endDate);
    this.validateDateRange(startDate, endDate);

    await this.checkDateOverlap(startDate, endDate);
    await this.validateSlotCourses(dto.slots);

    const module = await this.prisma.$transaction(async (tx) => {
      const created = await tx.timetableModule.create({ data: { startDate, endDate } });

      if (dto.slots.length > 0) {
        await tx.scheduleSlot.createMany({
          data: dto.slots.map((s) => ({
            moduleId: created.id,
            weekday: s.weekday,
            startMinute: this.timeToMinute(s.startTime),
            endMinute: this.timeToMinute(s.endTime),
            courseId: s.courseId,
          })),
        });
      }

      return created;
    });

    return {
      success: true,
      module: { id: module.id, startDate: this.formatDate(module.startDate), endDate: this.formatDate(module.endDate) },
    };
  }

  async updateTimetableModule(moduleId: string, dto: SaveTimetableModuleDto) {
    const existing = await this.prisma.timetableModule.findUnique({ where: { id: moduleId } });
    if (!existing) throw new NotFoundException('Timetable module not found');

    const startDate = this.parseDate(dto.startDate);
    const endDate = this.parseDate(dto.endDate);
    this.validateDateRange(startDate, endDate);

    await this.checkDateOverlap(startDate, endDate, moduleId);
    await this.validateSlotCourses(dto.slots);

    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteSlots(tx, moduleId);

      await tx.timetableModule.update({ where: { id: moduleId }, data: { startDate, endDate } });

      if (dto.slots.length > 0) {
        await tx.scheduleSlot.createMany({
          data: dto.slots.map((s) => ({
            moduleId,
            weekday: s.weekday,
            startMinute: this.timeToMinute(s.startTime),
            endMinute: this.timeToMinute(s.endTime),
            courseId: s.courseId,
          })),
        });
      }
    });

    return { success: true };
  }

  async deleteTimetableModule(moduleId: string) {
    const existing = await this.prisma.timetableModule.findUnique({ where: { id: moduleId } });
    if (!existing) throw new NotFoundException('Timetable module not found');

    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteSlots(tx, moduleId);
      await tx.timetableModule.delete({ where: { id: moduleId } });
    });

    return { success: true };
  }

  /* ───────────── Enrollment Management ───────────── */

  async getEnrollments(status?: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true } },
        scheduleSlot: {
          include: {
            course: {
              select: { id: true, name: true, type: true, feeCny: true, feeNzd: true },
            },
            module: { select: { id: true, startDate: true, endDate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      enrollments: enrollments.map((e) => ({
        id: e.id,
        status: e.status,
        createdAt: e.createdAt,
        user: e.user,
        slot: {
          id: e.scheduleSlot.id,
          weekday: e.scheduleSlot.weekday,
          startTime: this.minuteToTime(e.scheduleSlot.startMinute),
          endTime: this.minuteToTime(e.scheduleSlot.endMinute),
          course: this.mapCourseResponse(e.scheduleSlot.course),
          module: {
            id: e.scheduleSlot.module.id,
            startDate: this.formatDate(e.scheduleSlot.module.startDate),
            endDate: this.formatDate(e.scheduleSlot.module.endDate),
          },
        },
      })),
    };
  }

  async approveEnrollment(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.status !== 'PENDING') throw new BadRequestException('Enrollment is not pending');

    await this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: 'APPROVED' } });
    return { success: true };
  }

  async rejectEnrollment(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.status !== 'PENDING') throw new BadRequestException('Enrollment is not pending');

    await this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: 'REJECTED' } });
    return { success: true };
  }

  /* ───────────── Helpers ───────────── */

  private async cascadeDeleteSlots(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    moduleId: string,
  ) {
    const slotIds = (
      await tx.scheduleSlot.findMany({ where: { moduleId }, select: { id: true } })
    ).map((s) => s.id);

    if (slotIds.length === 0) return;

    await tx.enrollment.deleteMany({ where: { scheduleSlotId: { in: slotIds } } });
    await tx.scheduleSlot.deleteMany({ where: { moduleId } });
  }

  private validateDateRange(startDate: Date, endDate: Date) {
    if (startDate >= endDate) throw new BadRequestException('End date must be after start date');
  }

  private async checkDateOverlap(startDate: Date, endDate: Date, excludeModuleId?: string) {
    const overlapping = await this.prisma.timetableModule.findFirst({
      where: {
        ...(excludeModuleId ? { id: { not: excludeModuleId } } : {}),
        AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
      },
    });
    if (overlapping) throw new BadRequestException('Date range overlaps with an existing module');
  }

  private async validateSlotCourses(
    slots: { weekday: number; startTime: string; endTime: string; courseId: string }[],
  ) {
    if (slots.length === 0) return;
    const courseIds = [...new Set(slots.map((s) => s.courseId))];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, teacherId: true, name: true },
    });
    if (courses.length !== courseIds.length) throw new BadRequestException('One or more courses not found');

    const byId = new Map(courses.map((c) => [c.id, c]));
    const bySlotKey = new Map<string, Map<string, string>>();

    for (const s of slots) {
      const c = byId.get(s.courseId);
      if (!c) continue;
      const startM = this.timeToMinute(s.startTime);
      const endM = this.timeToMinute(s.endTime);
      const slotKey = `${s.weekday}|${startM}|${endM}`;
      let teacherMap = bySlotKey.get(slotKey);
      if (!teacherMap) {
        teacherMap = new Map();
        bySlotKey.set(slotKey, teacherMap);
      }
      const prev = teacherMap.get(c.teacherId);
      if (prev !== undefined && prev !== c.id) {
        throw new BadRequestException(
          'A teacher cannot teach multiple different courses in the same time slot (same weekday and time range).',
        );
      }
      teacherMap.set(c.teacherId, c.id);
    }
  }

  private courseLineLabel(course: {
    name: string;
    teacher?: { username?: string | null; name?: string | null } | null;
  }): string {
    const courseName = course.name || '';
    const t = course.teacher;
    if (t) {
      const u = (t.username || '').trim();
      const n = (t.name || '').trim();
      const teacherPart = u && n ? `${u}/${n}` : u || n;
      if (teacherPart) return `${courseName} (${teacherPart})`;
    }
    return courseName;
  }

  private mapCourseResponse(course: {
    id: string;
    name: string;
    type: any;
    feeCny: unknown;
    feeNzd: unknown;
    teacher?: { id: string; username: string; name: string } | null;
    createdAt?: Date;
  }) {
    return {
      id: course.id,
      name: course.name,
      type: course.type,
      feeCny: Number(course.feeCny),
      feeNzd: Number(course.feeNzd),
      teacher: course.teacher ?? undefined,
      createdAt: course.createdAt,
    };
  }

  private async getStudentAttendanceStats(userId: string, walletCurrency?: Currency | null) {
    const where = walletCurrency ? { userId, currency: walletCurrency } : { userId };
    const [agg, attendanceCount] = await Promise.all([
      this.prisma.attendance.aggregate({
        where,
        _sum: { feeDeducted: true },
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return {
      attendanceCount,
      totalAttendanceFees: Number(agg._sum.feeDeducted ?? 0),
    };
  }

  private async getStudentAttendanceStatsTx(
    tx: Prisma.TransactionClient,
    userId: string,
    walletCurrency?: Currency | null,
  ) {
    const where = walletCurrency ? { userId, currency: walletCurrency } : { userId };
    const [agg, attendanceCount] = await Promise.all([
      tx.attendance.aggregate({ where, _sum: { feeDeducted: true } }),
      tx.attendance.count({ where }),
    ]);
    return {
      attendanceCount,
      totalAttendanceFees: Number(agg._sum.feeDeducted ?? 0),
    };
  }

  private async sumAttendanceFeesForUser(
    userId: string,
    walletCurrency?: Currency | null,
  ): Promise<number> {
    const stats = await this.getStudentAttendanceStats(userId, walletCurrency);
    return stats.totalAttendanceFees;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseDate(value: string): Date {
    const parts = value.split('-');
    if (parts.length !== 3) throw new BadRequestException('Invalid date format');
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    const d = Number(parts[2]);
    const date = new Date(y, mo - 1, d);
    date.setHours(0, 0, 0, 0);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
      throw new BadRequestException('Invalid date');
    }
    return date;
  }

  private minuteToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private timeToMinute(time: string): number {
    const [h, m] = time.split(':');
    return Number(h) * 60 + Number(m);
  }
}
