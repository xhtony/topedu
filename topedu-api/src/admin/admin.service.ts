import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TimeSlot, WeekType, Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { PublishTimetableDto } from './dto/publish-timetable.dto';
import { UpsertTimetableModuleDto } from './dto/upsert-timetable-module.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly WEEKDAY_ENUMS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  private static readonly TIME_SLOT_ENUMS: TimeSlot[] = ['MORNING', 'AFTERNOON', 'EVENING'];

  private normalizeCourseName(name: string) {
    return String(name || '').trim();
  }

  private minuteToTimeLabel(value: number) {
    const hour = Math.floor(value / 60);
    const minute = value % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private parseTimeToMinute(value: string) {
    const [hourStr, minuteStr] = value.split(':');
    return Number(hourStr) * 60 + Number(minuteStr);
  }

  private minuteToWeekdayEnum(index: number): Weekday {
    return AdminService.WEEKDAY_ENUMS[index - 1] ?? 'MON';
  }

  private startOfWeekMonday(date: Date) {
    const value = new Date(date);
    const weekday = value.getDay();
    const delta = weekday === 0 ? -6 : 1 - weekday;
    value.setDate(value.getDate() + delta);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private parseDateOnly(value: string) {
    const raw = String(value || '').trim();
    const parts = raw.split('-');
    if (parts.length !== 3) {
      throw new BadRequestException('Invalid date');
    }
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      Number.isNaN(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      throw new BadRequestException('Invalid date');
    }
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new BadRequestException('Invalid date');
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private formatDateOnly(value: Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private validateTimeRange(startMinute: number, endMinute: number) {
    const minMinute = 6 * 60;
    const maxMinute = 18 * 60;
    if (startMinute < minMinute || endMinute > maxMinute) {
      throw new BadRequestException('Time range must be between 06:00 and 18:00');
    }
    if (startMinute >= endMinute) {
      throw new BadRequestException('End time must be after start time');
    }
  }

  private normalizeRows(rows: UpsertTimetableModuleDto['rows']) {
    const normalized = rows.map((row) => {
      const startMinute = this.parseTimeToMinute(row.startTime);
      const endMinute = this.parseTimeToMinute(row.endTime);
      this.validateTimeRange(startMinute, endMinute);
      return {
        startMinute,
        endMinute,
        startTime: this.minuteToTimeLabel(startMinute),
        endTime: this.minuteToTimeLabel(endMinute),
        courses: row.courses.slice(0, 7).map((course) => (course || '').trim()),
      };
    });

    const seen = new Set<string>();
    for (const row of normalized) {
      const key = `${row.startMinute}-${row.endMinute}`;
      if (seen.has(key)) {
        throw new BadRequestException('Duplicate time ranges are not allowed');
      }
      seen.add(key);
    }
    return normalized.sort((a, b) => a.startMinute - b.startMinute);
  }

  private buildWeekOffsets(startDate: Date, endDate: Date) {
    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('Start date must be earlier than end date');
    }
    const startMonday = this.startOfWeekMonday(startDate);
    const endMonday = this.startOfWeekMonday(endDate);
    const currentMonday = this.startOfWeekMonday(new Date());

    const offsets: number[] = [];
    const cursor = new Date(startMonday);
    while (cursor.getTime() <= endMonday.getTime()) {
      const offset = Math.floor(
        (cursor.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000),
      );
      offsets.push(offset);
      cursor.setDate(cursor.getDate() + 7);
    }
    if (offsets.length === 0) {
      throw new BadRequestException('No weeks found in date range');
    }
    return offsets;
  }

  private rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    const aStartDate = new Date(aStart.getFullYear(), aStart.getMonth(), aStart.getDate()).getTime();
    const aEndDate = new Date(aEnd.getFullYear(), aEnd.getMonth(), aEnd.getDate()).getTime();
    const bStartDate = new Date(bStart.getFullYear(), bStart.getMonth(), bStart.getDate()).getTime();
    const bEndDate = new Date(bEnd.getFullYear(), bEnd.getMonth(), bEnd.getDate()).getTime();
    return aStartDate <= bEndDate && bStartDate <= aEndDate;
  }

  private buildSlotsByOffsets(
    moduleId: string,
    weekOffsets: number[],
    rows: Array<{ startMinute: number; endMinute: number; courses: string[] }>,
  ) {
    const data: Prisma.CourseSlotCreateManyInput[] = [];
    for (const weekOffset of weekOffsets) {
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        for (let weekday = 1; weekday <= 7; weekday += 1) {
          const weekType: WeekType = weekOffset === 0 ? 'THIS_WEEK' : 'NEXT_WEEK';
          data.push({
            moduleId,
            weekType,
            weekday: this.minuteToWeekdayEnum(weekday),
            timeSlot: AdminService.TIME_SLOT_ENUMS[rowIndex % 3] ?? 'EVENING',
            weekOffset,
            weekdayIndex: weekday,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
            courseName: row.courses[weekday - 1] ?? '',
          });
        }
      }
    }
    return data;
  }

  private slotKeyOf(
    weekOffset: number | null | undefined,
    weekdayIndex: number | null | undefined,
    startMinute: number | null | undefined,
    endMinute: number | null | undefined,
  ) {
    const w = weekOffset ?? -1;
    const d = weekdayIndex ?? -1;
    const s = startMinute ?? -1;
    const e = endMinute ?? -1;
    return `${w}-${d}-${s}-${e}`;
  }

  private buildModuleRowsForView(rawRows: unknown) {
    if (!Array.isArray(rawRows)) {
      return [];
    }
    const rows: Array<{ startMinute: number; endMinute: number; startTime: string; endTime: string; courses: string[] }> =
      [];
    for (const item of rawRows) {
      const row = item as { startTime?: string; endTime?: string; courses?: string[] };
      if (!row.startTime || !row.endTime || !Array.isArray(row.courses)) {
        continue;
      }
      const startMinute = this.parseTimeToMinute(row.startTime);
      const endMinute = this.parseTimeToMinute(row.endTime);
      if (Number.isNaN(startMinute) || Number.isNaN(endMinute) || startMinute >= endMinute) {
        continue;
      }
      const courses = row.courses.slice(0, 7).map((v) => String(v ?? ''));
      while (courses.length < 7) {
        courses.push('');
      }
      rows.push({
        startMinute,
        endMinute,
        startTime: this.minuteToTimeLabel(startMinute),
        endTime: this.minuteToTimeLabel(endMinute),
        courses,
      });
    }
    return rows.sort((a, b) => a.startMinute - b.startMinute);
  }

  private async buildUserModuleTimetable(userId: string, includeSelectionId: boolean) {
    const modules = await this.prisma.timetableModule.findMany({
      orderBy: { startDate: 'asc' },
      select: { id: true, startDate: true, endDate: true, rows: true },
    });
    if (modules.length === 0) {
      return { weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], modules: [] };
    }

    const moduleIds = modules.map((item) => item.id);
    const slots = await this.prisma.courseSlot.findMany({
      where: { moduleId: { in: moduleIds } },
      select: {
        id: true,
        moduleId: true,
        weekOffset: true,
        weekdayIndex: true,
        startMinute: true,
        endMinute: true,
        selections: {
          where: { userId },
          select: { id: true, status: true },
        },
      },
      orderBy: [{ weekOffset: 'asc' }, { weekdayIndex: 'asc' }],
    });

    const cellMap = new Map<
      string,
      { slotId: string; selectionStatus: 'APPROVED' | 'PENDING' | null; selectionId: string | null; weekOffset: number }
    >();
    for (const slot of slots) {
      const weekdayIndex = slot.weekdayIndex ?? 1;
      const startMinute = slot.startMinute ?? 600;
      const endMinute = slot.endMinute ?? 660;
      const key = `${slot.moduleId}-${startMinute}-${endMinute}-${weekdayIndex}`;
      const existing = cellMap.get(key);

      let status: 'APPROVED' | 'PENDING' | null = null;
      let selectionId: string | null = null;
      for (const selection of slot.selections) {
        if (selection.status === 'APPROVED') {
          status = 'APPROVED';
          selectionId = selection.id;
          break;
        }
        if (selection.status === 'PENDING') {
          status = 'PENDING';
          selectionId = selection.id;
        }
      }

      const currentOffset = slot.weekOffset ?? Number.MAX_SAFE_INTEGER;
      if (!existing || currentOffset < existing.weekOffset) {
        cellMap.set(key, {
          slotId: slot.id,
          selectionStatus: status,
          selectionId,
          weekOffset: currentOffset,
        });
        continue;
      }
      if (existing.selectionStatus !== 'APPROVED' && status === 'APPROVED') {
        existing.selectionStatus = 'APPROVED';
        existing.selectionId = selectionId;
      } else if (!existing.selectionStatus && status === 'PENDING') {
        existing.selectionStatus = 'PENDING';
        existing.selectionId = selectionId;
      }
    }

    return {
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      modules: modules.map((module) => {
        const rows = this.buildModuleRowsForView(module.rows).map((row) => ({
          startTime: row.startTime,
          endTime: row.endTime,
          cells: row.courses.map((courseName, index) => {
            const key = `${module.id}-${row.startMinute}-${row.endMinute}-${index + 1}`;
            const hit = cellMap.get(key);
            return {
              slotId: hit?.slotId ?? '',
              courseName,
              selectionStatus: hit?.selectionStatus ?? null,
              selectionId: includeSelectionId ? hit?.selectionId ?? null : null,
            };
          }),
        }));
        return {
          id: module.id,
          startDate: this.formatDateOnly(module.startDate),
          endDate: this.formatDateOnly(module.endDate),
          rows,
        };
      }),
    };
  }

  async getTimetableModules() {
    const modules = await this.prisma.timetableModule.findMany({
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        rows: true,
      },
    });

    return {
      modules: modules.map((module) => ({
        id: module.id,
        startDate: this.formatDateOnly(module.startDate),
        endDate: this.formatDateOnly(module.endDate),
        rows: Array.isArray(module.rows) ? module.rows : [],
      })),
    };
  }

  async getCourses() {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id, name FROM courses ORDER BY name ASC`,
    );
    return { courses: rows };
  }

  async createCourse(dto: CreateCourseDto) {
    const name = this.normalizeCourseName(dto.name);
    if (!name) {
      throw new BadRequestException('Course name is required');
    }

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM courses WHERE LOWER(name) = LOWER(${name}) LIMIT 1`,
    );
    if (existing.length > 0) {
      throw new BadRequestException('Course already exists');
    }

    const id = crypto.randomUUID();
    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO courses (id, name, created_at, updated_at) VALUES (${id}, ${name}, NOW(3), NOW(3))`,
    );
    return { success: true, course: { id, name } };
  }

  async updateCourse(courseId: string, dto: UpdateCourseDto) {
    const name = this.normalizeCourseName(dto.name);
    if (!name) {
      throw new BadRequestException('Course name is required');
    }

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM courses WHERE id = ${courseId} LIMIT 1`,
    );
    if (existing.length === 0) {
      throw new NotFoundException('Course not found');
    }

    const duplicate = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM courses WHERE LOWER(name) = LOWER(${name}) AND id <> ${courseId} LIMIT 1`,
    );
    if (duplicate.length > 0) {
      throw new BadRequestException('Course already exists');
    }

    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE courses SET name = ${name}, updated_at = NOW(3) WHERE id = ${courseId}`,
    );
    return { success: true, course: { id: courseId, name } };
  }

  async deleteCourse(courseId: string) {
    const existing = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id, name FROM courses WHERE id = ${courseId} LIMIT 1`,
    );
    if (existing.length === 0) {
      throw new NotFoundException('Course not found');
    }

    const courseName = this.normalizeCourseName(existing[0].name);
    const usageCountRows = await this.prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`SELECT COUNT(1) AS count FROM course_slots WHERE LOWER(TRIM(course_name)) = LOWER(${courseName})`,
    );
    const usageCount = Number(usageCountRows[0]?.count ?? 0);
    if (usageCount > 0) {
      throw new BadRequestException('Course is already used in timetable and cannot be deleted.');
    }

    await this.prisma.$executeRaw(Prisma.sql`DELETE FROM courses WHERE id = ${courseId}`);
    return { success: true };
  }

  async getUserTimetableModules(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.buildUserModuleTimetable(userId, true);
  }

  async createTimetableModule(dto: UpsertTimetableModuleDto) {
    const startDate = this.parseDateOnly(dto.startDate);
    const endDate = this.parseDateOnly(dto.endDate);
    const rows = this.normalizeRows(dto.rows);
    const weekOffsets = this.buildWeekOffsets(startDate, endDate);

    const module = await this.prisma.$transaction(async (tx) => {
      const existingModules = await tx.timetableModule.findMany({
        select: { id: true, startDate: true, endDate: true },
      });
      for (const existing of existingModules) {
        if (this.rangesOverlap(startDate, endDate, existing.startDate, existing.endDate)) {
          throw new BadRequestException('Date ranges cannot overlap with other modules');
        }
      }

      const created = await tx.timetableModule.create({
        data: {
          startDate,
          endDate,
          rows: rows as Prisma.InputJsonValue,
        },
      });

      const existingSlots = await tx.courseSlot.findMany({
        where: { weekOffset: { in: weekOffsets } },
        select: { id: true },
      });
      if (existingSlots.length > 0) {
        await tx.courseSelection.deleteMany({
          where: { courseSlotId: { in: existingSlots.map((item) => item.id) } },
        });
        await tx.courseSlot.deleteMany({
          where: { id: { in: existingSlots.map((item) => item.id) } },
        });
      }

      const slotData = this.buildSlotsByOffsets(created.id, weekOffsets, rows);
      if (slotData.length > 0) {
        await tx.courseSlot.createMany({ data: slotData });
      }

      return created;
    });

    return {
      success: true,
      module: {
        id: module.id,
        startDate: this.formatDateOnly(module.startDate),
        endDate: this.formatDateOnly(module.endDate),
        rows,
      },
    };
  }

  async updateTimetableModule(moduleId: string, dto: UpsertTimetableModuleDto) {
    const startDate = this.parseDateOnly(dto.startDate);
    const endDate = this.parseDateOnly(dto.endDate);
    const rows = this.normalizeRows(dto.rows);
    const weekOffsets = this.buildWeekOffsets(startDate, endDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingModule = await tx.timetableModule.findUnique({
        where: { id: moduleId },
        select: { id: true },
      });
      if (!existingModule) {
        throw new NotFoundException('Timetable module not found');
      }

      const otherModules = await tx.timetableModule.findMany({
        where: { id: { not: moduleId } },
        select: { id: true, startDate: true, endDate: true },
      });
      for (const existing of otherModules) {
        if (this.rangesOverlap(startDate, endDate, existing.startDate, existing.endDate)) {
          throw new BadRequestException('Date ranges cannot overlap with other modules');
        }
      }

      const rangeSlots = await tx.courseSlot.findMany({
        where: { weekOffset: { in: weekOffsets } },
        select: {
          id: true,
          weekOffset: true,
          weekdayIndex: true,
          startMinute: true,
          endMinute: true,
          selections: {
            select: {
              userId: true,
              status: true,
            },
          },
        },
      });

      const carrySelections = new Map<
        string,
        Array<{
          userId: string;
          status: 'PENDING' | 'APPROVED';
        }>
      >();
      for (const slot of rangeSlots) {
        const key = this.slotKeyOf(slot.weekOffset, slot.weekdayIndex, slot.startMinute, slot.endMinute);
        if (!carrySelections.has(key)) {
          carrySelections.set(key, []);
        }
        for (const selection of slot.selections) {
          carrySelections.get(key)!.push({
            userId: selection.userId,
            status: selection.status,
          });
        }
      }

      if (rangeSlots.length > 0) {
        const rangeSlotIds = rangeSlots.map((item) => item.id);
        await tx.courseSelection.deleteMany({
          where: { courseSlotId: { in: rangeSlotIds } },
        });
        await tx.courseSlot.deleteMany({
          where: { id: { in: rangeSlotIds } },
        });
      }

      const slotData = this.buildSlotsByOffsets(moduleId, weekOffsets, rows);
      if (slotData.length > 0) {
        await tx.courseSlot.createMany({ data: slotData });

        const newSlots = await tx.courseSlot.findMany({
          where: {
            moduleId,
            weekOffset: { in: weekOffsets },
          },
          select: {
            id: true,
            weekOffset: true,
            weekdayIndex: true,
            startMinute: true,
            endMinute: true,
          },
        });

        const newSlotByKey = new Map<string, string>();
        for (const slot of newSlots) {
          const key = this.slotKeyOf(slot.weekOffset, slot.weekdayIndex, slot.startMinute, slot.endMinute);
          newSlotByKey.set(key, slot.id);
        }

        const toInsert: Array<{ userId: string; courseSlotId: string; status: 'PENDING' | 'APPROVED' }> = [];
        const dedupe = new Set<string>();
        for (const [key, selections] of carrySelections.entries()) {
          const newSlotId = newSlotByKey.get(key);
          if (!newSlotId) {
            continue;
          }
          for (const selection of selections) {
            const uniq = `${selection.userId}-${newSlotId}`;
            if (dedupe.has(uniq)) {
              continue;
            }
            dedupe.add(uniq);
            toInsert.push({
              userId: selection.userId,
              courseSlotId: newSlotId,
              status: selection.status,
            });
          }
        }

        if (toInsert.length > 0) {
          await tx.courseSelection.createMany({
            data: toInsert,
          });
        }
      }

      return tx.timetableModule.update({
        where: { id: moduleId },
        data: {
          startDate,
          endDate,
          rows: rows as Prisma.InputJsonValue,
        },
      });
    });

    return {
      success: true,
      module: {
        id: updated.id,
        startDate: this.formatDateOnly(updated.startDate),
        endDate: this.formatDateOnly(updated.endDate),
        rows,
      },
    };
  }

  async getUsers(email?: string, excludeUserId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: excludeUserId
          ? {
              not: excludeUserId,
            }
          : undefined,
        email: email
          ? {
              contains: email.toLowerCase().trim(),
            }
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mustChangePassword: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    return { users };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mustChangePassword: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const selections = await this.prisma.courseSelection.findMany({
      where: { userId },
      include: {
        courseSlot: {
          select: {
            id: true,
            weekOffset: true,
            weekday: true,
            weekdayIndex: true,
            startMinute: true,
            endMinute: true,
            courseName: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return { user, selections };
  }

  async getTimetable(weekOffset: number) {
    const slots = await this.prisma.courseSlot.findMany({
      where: { weekOffset },
      orderBy: [{ startMinute: 'asc' }, { weekdayIndex: 'asc' }],
    });

    const rowMap = new Map<
      string,
      {
        startMinute: number;
        endMinute: number;
        courses: string[];
      }
    >();
    for (const slot of slots) {
      const startMinute = slot.startMinute ?? 600;
      const endMinute = slot.endMinute ?? 660;
      const key = `${startMinute}-${endMinute}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          startMinute,
          endMinute,
          courses: ['', '', '', '', '', '', ''],
        });
      }
      const idx = (slot.weekdayIndex ?? AdminService.WEEKDAY_ENUMS.indexOf(slot.weekday) + 1) - 1;
      rowMap.get(key)!.courses[idx] = slot.courseName;
    }

    const rows = Array.from(rowMap.values())
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((row) => ({
        startTime: this.minuteToTimeLabel(row.startMinute),
        endTime: this.minuteToTimeLabel(row.endMinute),
        courses: row.courses,
      }));

    return { weekOffset, rows };
  }

  async publishTimetable(dto: PublishTimetableDto) {
    const flattened: Prisma.CourseSlotCreateManyInput[] = [];
    for (let rowIndex = 0; rowIndex < dto.rows.length; rowIndex += 1) {
      const row = dto.rows[rowIndex];
      if (!Array.isArray(row.courses) || row.courses.length < 7) {
        throw new BadRequestException('Each row must provide 7 course names');
      }
      const startMinute = this.parseTimeToMinute(row.startTime);
      const endMinute = this.parseTimeToMinute(row.endTime);
      this.validateTimeRange(startMinute, endMinute);

      for (let weekday = 1; weekday <= 7; weekday += 1) {
        const weekType: WeekType = dto.weekOffset === 0 ? 'THIS_WEEK' : 'NEXT_WEEK';
        flattened.push({
          weekType,
          weekday: AdminService.WEEKDAY_ENUMS[weekday - 1],
          timeSlot: AdminService.TIME_SLOT_ENUMS[rowIndex % 3] ?? 'EVENING',
          weekOffset: dto.weekOffset,
          weekdayIndex: weekday,
          startMinute,
          endMinute,
          courseName: (row.courses[weekday - 1] || '').trim(),
        });
      }
    }

    const duplicateKeys = new Set<string>();
    for (const slot of flattened) {
      const key = `${slot.weekOffset}-${slot.weekday}-${slot.startMinute}-${slot.endMinute}`;
      if (duplicateKeys.has(key)) {
        throw new BadRequestException('Duplicate time ranges found in timetable');
      }
      duplicateKeys.add(key);
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.courseSlot.findMany({
        where: { weekOffset: dto.weekOffset },
        select: { id: true },
      });
      const existingIds = existing.map((item) => item.id);
      if (existingIds.length > 0) {
        await tx.courseSelection.deleteMany({
          where: { courseSlotId: { in: existingIds } },
        });
      }
      await tx.courseSlot.deleteMany({
        where: { weekOffset: dto.weekOffset },
      });
      if (flattened.length > 0) {
        await tx.courseSlot.createMany({ data: flattened });
      }
    });

    return { success: true, message: 'Timetable published successfully' };
  }

  async approveSelection(selectionId: string) {
    const selection = await this.prisma.courseSelection.findUnique({
      where: { id: selectionId },
    });
    if (!selection) {
      throw new NotFoundException('Selection not found');
    }

    await this.prisma.courseSelection.update({
      where: { id: selection.id },
      data: { status: 'APPROVED' },
    });

    return { success: true, message: 'Selection approved' };
  }

  async rejectSelection(selectionId: string) {
    const selection = await this.prisma.courseSelection.findUnique({
      where: { id: selectionId },
      select: { id: true },
    });
    if (!selection) {
      throw new NotFoundException('Selection not found');
    }

    await this.prisma.courseSelection.delete({
      where: { id: selection.id },
    });

    return { success: true, message: 'Selection rejected' };
  }
}
