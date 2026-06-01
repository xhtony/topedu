import { BadRequestException, Injectable } from '@nestjs/common';
import { Currency, Prisma, RecordSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getCourseFee,
  computeStudentBalance,
  resolveCheckInBillingCurrency,
  computeDualStudentBalances,
  mapStudentWalletResponse,
} from '../common/currency.util';
import { EnrollDto } from './dto/enroll.dto';
import { CheckInDto } from './dto/check-in.dto';
import { LeaveDto } from './dto/leave.dto';

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  async getSchedule(userId: string) {
    const walletCurrency = await this.getStudentWalletCurrency(userId);
    const modules = await this.prisma.timetableModule.findMany({
      orderBy: { startDate: 'asc' },
      include: {
        scheduleSlots: {
          include: {
            course: {
              include: { teacher: { select: { id: true, username: true, name: true } } },
            },
            enrollments: {
              where: { userId, status: { in: ['APPROVED', 'PENDING'] } },
              select: { id: true, status: true },
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
          course: this.mapCourseForStudent(s.course, walletCurrency),
          enrollment: s.enrollments[0]
            ? { id: s.enrollments[0].id, status: s.enrollments[0].status }
            : null,
        })),
      })),
    };
  }

  async getTimetableView(userId: string) {
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

  async getWalletSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { prepaymentCny: true, prepaymentNzd: true, walletCurrency: true },
    });
    if (!user) throw new BadRequestException('User not found');

    const [feesCny, feesNzd, countCny, countNzd] = await Promise.all([
      this.sumAttendanceFeesForUser(userId, Currency.CNY),
      this.sumAttendanceFeesForUser(userId, Currency.NZD),
      this.countAttendanceForUser(userId, Currency.CNY),
      this.countAttendanceForUser(userId, Currency.NZD),
    ]);

    return mapStudentWalletResponse(user, feesCny, feesNzd, countCny, countNzd);
  }

  async requestLeave(userId: string, dto: LeaveDto, opts?: { admin?: boolean }) {
    const todayStr = this.serverTodayParts().dateStr;
    const leaveDate = dto.date ? this.parseCalendarDate(dto.date) : this.parseCalendarDate(todayStr);
    const leaveStr = this.formatDate(leaveDate);

    if (!opts?.admin && leaveStr !== todayStr) {
      throw new BadRequestException('Leave can only be requested for today');
    }
    if (opts?.admin) {
      if (!dto.date) throw new BadRequestException('Date is required');
      if (leaveStr > todayStr) throw new BadRequestException('Cannot record leave for a future date');
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: dto.enrollmentId },
      include: {
        scheduleSlot: {
          include: { module: true },
        },
      },
    });

    if (!enrollment || enrollment.userId !== userId) {
      throw new BadRequestException('Enrollment not found');
    }
    if (enrollment.status !== 'APPROVED') {
      throw new BadRequestException('Enrollment is not approved');
    }

    const jsDay = leaveDate.getDay();
    const expectedJsDay = enrollment.scheduleSlot.weekday === 7 ? 0 : enrollment.scheduleSlot.weekday;
    if (jsDay !== expectedJsDay) {
      throw new BadRequestException('This date does not match the scheduled weekday for this class');
    }

    const modStartStr = this.formatDate(new Date(enrollment.scheduleSlot.module.startDate));
    const modEndStr = this.formatDate(new Date(enrollment.scheduleSlot.module.endDate));
    if (leaveStr < modStartStr || leaveStr > modEndStr) {
      throw new BadRequestException('Date is outside the course schedule range');
    }

    const dayStart = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate() + 1, 0, 0, 0, 0);
    const existingAtt = await this.prisma.attendance.findFirst({
      where: {
        userId,
        scheduleSlotId: enrollment.scheduleSlotId,
        date: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existingAtt) {
      throw new BadRequestException('Already checked in for this date; cannot request leave');
    }

    const existingLeave = await this.prisma.leaveRequest.findFirst({
      where: {
        enrollmentId: enrollment.id,
        date: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existingLeave) {
      return { success: true, message: 'Leave already recorded for this date' };
    }

    try {
      await this.prisma.leaveRequest.create({
        data: {
          userId,
          enrollmentId: enrollment.id,
          date: leaveDate,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { success: true, message: 'Leave already recorded for this date' };
      }
      throw e;
    }

    return { success: true, message: 'Leave recorded' };
  }

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { prepaymentCny: true, prepaymentNzd: true, walletCurrency: true },
    });
    if (!user) throw new BadRequestException('User not found');
    const [feesCny, feesNzd] = await Promise.all([
      this.sumAttendanceFeesForUser(userId, Currency.CNY),
      this.sumAttendanceFeesForUser(userId, Currency.NZD),
    ]);
    const balances = computeDualStudentBalances(
      Number(user.prepaymentCny),
      Number(user.prepaymentNzd),
      feesCny,
      feesNzd,
    );
    return {
      walletCurrency: user.walletCurrency,
      prepaymentCny: Number(user.prepaymentCny),
      prepaymentNzd: Number(user.prepaymentNzd),
      balanceCny: balances.balanceCny,
      balanceNzd: balances.balanceNzd,
    };
  }

  async getEnrollments(userId: string) {
    const walletCurrency = await this.getStudentWalletCurrency(userId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        scheduleSlot: {
          include: {
            course: {
              include: { teacher: { select: { id: true, username: true, name: true } } },
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
        slot: {
          id: e.scheduleSlot.id,
          weekday: e.scheduleSlot.weekday,
          startTime: this.minuteToTime(e.scheduleSlot.startMinute),
          endTime: this.minuteToTime(e.scheduleSlot.endMinute),
          course: this.mapCourseForStudent(e.scheduleSlot.course, walletCurrency),
          module: {
            id: e.scheduleSlot.module.id,
            startDate: this.formatDate(e.scheduleSlot.module.startDate),
            endDate: this.formatDate(e.scheduleSlot.module.endDate),
          },
        },
      })),
    };
  }

  async enroll(userId: string, dto: EnrollDto) {
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.scheduleSlot.findUnique({
        where: { id: dto.scheduleSlotId },
      });
      if (!slot) throw new BadRequestException('Schedule slot not found');

      const existing = await tx.enrollment.findUnique({
        where: { userId_scheduleSlotId: { userId, scheduleSlotId: dto.scheduleSlotId } },
      });

      if (existing) {
        if (existing.status === 'APPROVED') throw new BadRequestException('Already enrolled and approved');
        if (existing.status === 'PENDING') throw new BadRequestException('Enrollment is pending approval');
        await tx.enrollment.update({ where: { id: existing.id }, data: { status: 'PENDING' } });
        return { success: true, message: 'Re-enrollment submitted, waiting for approval' };
      }

      await tx.enrollment.create({
        data: { userId, scheduleSlotId: dto.scheduleSlotId, status: 'PENDING' },
      });

      return { success: true, message: 'Enrollment submitted, waiting for admin approval' };
    });
  }

  async checkIn(
    userId: string,
    dto: CheckInDto,
    opts?: { admin?: boolean; operatorId?: string; recordSource?: RecordSource },
  ) {
    const todayStr = this.serverTodayParts().dateStr;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: dto.enrollmentId },
      include: {
        scheduleSlot: {
          include: {
            course: { select: { feeCny: true, feeNzd: true, name: true } },
            module: { select: { startDate: true, endDate: true } },
          },
        },
      },
    });

    if (!enrollment || enrollment.userId !== userId) {
      throw new BadRequestException('Enrollment not found');
    }
    if (enrollment.status !== 'APPROVED') {
      throw new BadRequestException('Enrollment is not approved');
    }

    const checkInDate = dto.date ? this.parseCalendarDate(dto.date) : this.parseCalendarDate(todayStr);
    const checkStr = this.formatDate(checkInDate);

    if (!opts?.admin && checkStr !== todayStr) {
      throw new BadRequestException('Check-in is only allowed for today');
    }
    if (opts?.admin) {
      if (!dto.date) throw new BadRequestException('Date is required');
      if (checkStr > todayStr) throw new BadRequestException('Cannot check in for a future date');
    }

    const modStartStr = this.formatDate(new Date(enrollment.scheduleSlot.module.startDate));
    const modEndStr = this.formatDate(new Date(enrollment.scheduleSlot.module.endDate));
    if (checkStr < modStartStr || checkStr > modEndStr) {
      throw new BadRequestException('Check-in date is outside the course schedule range');
    }

    const jsDay = checkInDate.getDay();
    const slotWeekday = enrollment.scheduleSlot.weekday;
    const expectedJsDay = slotWeekday === 7 ? 0 : slotWeekday;
    if (jsDay !== expectedJsDay) {
      throw new BadRequestException('Check-in date does not match the scheduled weekday');
    }

    const startMinute = enrollment.scheduleSlot.startMinute;
    if (!opts?.admin) {
      const dayStart = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate(), 0, 0, 0, 0);
      const windowStartMs = dayStart.getTime() + Math.max(0, startMinute - 15) * 60 * 1000;
      const windowEnd = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate(), 23, 59, 59, 999);
      const now = Date.now();
      if (now < windowStartMs || now > windowEnd.getTime()) {
        throw new BadRequestException(
          'Check-in opens 15 minutes before class start and closes at the end of the same day',
        );
      }
    }

    const checkDayStart = new Date(
      checkInDate.getFullYear(),
      checkInDate.getMonth(),
      checkInDate.getDate(),
      0,
      0,
      0,
      0,
    );
    const checkDayEnd = new Date(
      checkInDate.getFullYear(),
      checkInDate.getMonth(),
      checkInDate.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const leavesForDay = await this.prisma.leaveRequest.findMany({
      where: { userId, date: { gte: checkDayStart, lt: checkDayEnd } },
      include: { enrollment: { select: { scheduleSlotId: true } } },
    });
    const leaveForSlot = leavesForDay.find(
      (l) =>
        l.enrollmentId === enrollment.id ||
        l.enrollment?.scheduleSlotId === enrollment.scheduleSlotId,
    );
    if (leaveForSlot) {
      throw new BadRequestException('Leave already recorded for this date; cannot check in');
    }

    const course = enrollment.scheduleSlot.course;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findUnique({
        where: {
          userId_scheduleSlotId_date: {
            userId,
            scheduleSlotId: enrollment.scheduleSlotId,
            date: checkInDate,
          },
        },
      });
      if (existing) throw new BadRequestException('Already checked in for this date');

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { prepaymentCny: true, prepaymentNzd: true, walletCurrency: true },
      });
      if (!user) {
        throw new BadRequestException('User not found');
      }

      const prepaymentCny = Number(user.prepaymentCny);
      const prepaymentNzd = Number(user.prepaymentNzd);
      const feeCny = Number(course.feeCny);
      const feeNzd = Number(course.feeNzd);

      const [statsCny, statsNzd] = await Promise.all([
        this.getStudentAttendanceStatsTx(tx, userId, Currency.CNY),
        this.getStudentAttendanceStatsTx(tx, userId, Currency.NZD),
      ]);
      const balanceCny = computeStudentBalance(prepaymentCny, statsCny.totalAttendanceFees);
      const balanceNzd = computeStudentBalance(prepaymentNzd, statsNzd.totalAttendanceFees);

      const billing = resolveCheckInBillingCurrency(
        {
          walletCurrency: user.walletCurrency,
          prepaymentCny,
          prepaymentNzd,
          balanceCny,
          balanceNzd,
        },
        { feeCny, feeNzd },
        dto.currency,
      );
      const billingCurrency = billing.currency;
      const fee = billingCurrency === Currency.CNY ? feeCny : feeNzd;
      const recordSource =
        opts?.recordSource ?? (opts?.admin ? RecordSource.ADMIN : RecordSource.STUDENT);
      const createdById = opts?.operatorId ?? userId;

      const newFeesCny =
        statsCny.totalAttendanceFees + (billingCurrency === Currency.CNY ? fee : 0);
      const newFeesNzd =
        statsNzd.totalAttendanceFees + (billingCurrency === Currency.NZD ? fee : 0);
      const balancesAfter = computeDualStudentBalances(
        prepaymentCny,
        prepaymentNzd,
        newFeesCny,
        newFeesNzd,
      );

      try {
        await tx.attendance.create({
          data: {
            enrollmentId: enrollment.id,
            userId,
            scheduleSlotId: enrollment.scheduleSlotId,
            courseName: course.name,
            date: checkInDate,
            currency: billingCurrency,
            feeDeducted: fee,
            balanceCnyAfter: balancesAfter.balanceCny,
            balanceNzdAfter: balancesAfter.balanceNzd,
            recordSource,
            createdById,
            billingSelectionReason: billing.reason,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new BadRequestException('Already checked in for this date');
        }
        throw e;
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          balanceCny: balancesAfter.balanceCny,
          balanceNzd: balancesAfter.balanceNzd,
        },
      });

      const stats = await this.getStudentAttendanceStatsTx(tx, userId, billingCurrency);

      return {
        success: true,
        currency: billingCurrency,
        billingSelectionReason: billing.reason,
        feeDeducted: fee,
        remainingBalance:
          billingCurrency === Currency.CNY
            ? balancesAfter.balanceCny
            : balancesAfter.balanceNzd,
        balanceCnyAfter: balancesAfter.balanceCny,
        balanceNzdAfter: balancesAfter.balanceNzd,
        attendanceCount: stats.attendanceCount,
      };
    });
  }

  async getAttendances(userId: string) {
    const attendances = await this.prisma.attendance.findMany({
      where: { userId },
      include: {
        createdBy: { select: { id: true, username: true, name: true } },
        enrollment: {
          include: {
            scheduleSlot: {
              include: { course: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return {
      attendances: attendances.map((a) => ({
        id: a.id,
        date: this.formatDate(a.date),
        feeDeducted: Number(a.feeDeducted),
        currency: a.currency,
        courseName: a.enrollment?.scheduleSlot?.course?.name ?? a.courseName ?? '—',
        recordSource: a.recordSource,
        billingSelectionReason: a.billingSelectionReason,
        createdBy: a.createdBy,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * Flat list of every scheduled class occurrence in module ranges, with sign-in / leave / missed / future state.
   */
  async getSessionList(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: 'APPROVED' },
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
    });

    const attendances = await this.prisma.attendance.findMany({
      where: { userId },
      include: {
        createdBy: { select: { id: true, username: true, name: true } },
      },
    });
    const attMap = new Map(
      attendances.map((a) => [`${a.scheduleSlotId}|${this.formatDate(a.date)}`, a]),
    );

    const leaves = await this.prisma.leaveRequest.findMany({
      where: { userId },
      include: { enrollment: { select: { scheduleSlotId: true } } },
    });
    const leaveSet = new Set(
      leaves
        .map((l) => {
          const sid = l.enrollment?.scheduleSlotId;
          return sid ? `${sid}|${this.formatDate(l.date)}` : null;
        })
        .filter((k): k is string => k !== null),
    );

    const { dateStr: todayStr, weekday: todayWeekday } = this.serverTodayParts();
    const now = Date.now();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    type DisplayStatus = 'future' | 'today_open' | 'attended' | 'leave' | 'missed';

    const sessions: {
      enrollmentId: string;
      date: string;
      courseLabel: string;
      feeCny: number;
      feeNzd: number;
      startTime: string;
      endTime: string;
      startMinute: number;
      weekdayLabel: string;
      displayStatus: DisplayStatus;
      attendance?: {
        id: string;
        currency: Currency;
        feeDeducted: number;
        recordSource: RecordSource;
        billingSelectionReason: string | null;
        createdAt: Date;
        createdBy: { id: string; username: string; name: string } | null;
      };
    }[] = [];

    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const e of enrollments) {
      const slot = e.scheduleSlot;
      const mod = slot.module;
      const start = this.parseCalendarDate(this.formatDate(mod.startDate));
      const end = this.parseCalendarDate(this.formatDate(mod.endDate));

      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12, 0, 0, 0);

      while (cur.getTime() <= last.getTime()) {
        const jsDay = cur.getDay();
        const dbWeekday = jsDay === 0 ? 7 : jsDay;
        if (dbWeekday === slot.weekday) {
          const dateStr = this.formatDate(cur);
          const key = `${slot.id}|${dateStr}`;
          const att = attMap.get(key);
          const hasAtt = !!att;
          const hasLeave = leaveSet.has(key);

          let displayStatus: DisplayStatus;
          if (dateStr > todayStr) {
            displayStatus = 'future';
          } else if (dateStr < todayStr) {
            if (hasAtt) displayStatus = 'attended';
            else if (hasLeave) displayStatus = 'leave';
            else displayStatus = 'missed';
          } else {
            if (hasAtt) displayStatus = 'attended';
            else if (hasLeave) displayStatus = 'leave';
            else if (now <= endOfToday.getTime()) displayStatus = 'today_open';
            else displayStatus = 'missed';
          }

          sessions.push({
            enrollmentId: e.id,
            date: dateStr,
            courseLabel: this.courseLineLabel(slot.course),
            feeCny: Number(slot.course.feeCny),
            feeNzd: Number(slot.course.feeNzd),
            startTime: this.minuteToTime(slot.startMinute),
            endTime: this.minuteToTime(slot.endMinute),
            startMinute: slot.startMinute,
            weekdayLabel: weekdayLabels[jsDay],
            displayStatus,
            ...(att
              ? {
                  attendance: {
                    id: att.id,
                    currency: att.currency,
                    feeDeducted: Number(att.feeDeducted),
                    recordSource: att.recordSource,
                    billingSelectionReason: att.billingSelectionReason,
                    createdAt: att.createdAt,
                    createdBy: att.createdBy,
                  },
                }
              : {}),
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    sessions.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.startTime.localeCompare(b.startTime);
    });

    return {
      sessions,
      today: { date: todayStr, weekday: todayWeekday },
    };
  }

  private serverTodayParts(): { dateStr: string; weekday: number } {
    const now = new Date();
    const dateStr = this.formatDate(now);
    const js = now.getDay();
    const weekday = js === 0 ? 7 : js;
    return { dateStr, weekday };
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

  private async getStudentWalletCurrency(userId: string): Promise<Currency | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletCurrency: true },
    });
    return user?.walletCurrency ?? null;
  }

  private mapCourseForStudent(
    course: {
      id: string;
      name: string;
      type: any;
      feeCny: unknown;
      feeNzd: unknown;
      teacher?: { id: string; username: string; name: string } | null;
    },
    walletCurrency: Currency | null,
  ) {
    return {
      id: course.id,
      name: course.name,
      type: course.type,
      feeCny: Number(course.feeCny),
      feeNzd: Number(course.feeNzd),
      walletCurrency,
      fee: walletCurrency ? getCourseFee(course, walletCurrency) : null,
      teacher: course.teacher ?? undefined,
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

  private async countAttendanceForUser(userId: string, walletCurrency?: Currency | null): Promise<number> {
    const where = walletCurrency ? { userId, currency: walletCurrency } : { userId };
    return this.prisma.attendance.count({ where });
  }

  private async sumAttendanceFeesForUser(
    userId: string,
    walletCurrency?: Currency | null,
  ): Promise<number> {
    const agg = await this.prisma.attendance.aggregate({
      where: walletCurrency ? { userId, currency: walletCurrency } : { userId },
      _sum: { feeDeducted: true },
    });
    return Number(agg._sum.feeDeducted ?? 0);
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Calendar date for MySQL DATE fields and Prisma compound keys.
   * Uses local noon so the stored calendar day does not shift across timezones.
   */
  private parseCalendarDate(value: string): Date {
    const parts = value.split('-');
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    const d = Number(parts[2]);
    return new Date(y, mo - 1, d, 12, 0, 0, 0);
  }

  private parseDate(value: string): Date {
    return this.parseCalendarDate(value);
  }

  private minuteToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
