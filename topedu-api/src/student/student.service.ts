import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, SelectionStatus, TimeSlot, WeekType, Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_ENUMS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const TIME_SLOT_ENUMS: TimeSlot[] = ['MORNING', 'AFTERNOON', 'EVENING'];

@Injectable()
export class StudentService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedCourseSlots();
  }

  private parseTimeToMinute(value: string) {
    const [hourStr, minuteStr] = value.split(':');
    return Number(hourStr) * 60 + Number(minuteStr);
  }

  private minuteToTimeLabel(value: number) {
    const hour = Math.floor(value / 60);
    const minute = value % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private async seedCourseSlots() {
    const slotCount = await this.prisma.courseSlot.count({
      where: { weekOffset: { not: null } },
    });
    if (slotCount > 0) {
      return;
    }

    await this.prisma.courseSelection.deleteMany({});
    await this.prisma.courseSlot.deleteMany({});

    const rows = [
      {
        startMinute: this.parseTimeToMinute('10:00'),
        endMinute: this.parseTimeToMinute('11:00'),
      },
      {
        startMinute: this.parseTimeToMinute('11:30'),
        endMinute: this.parseTimeToMinute('12:30'),
      },
    ];

    const coursesByWeek: string[][][] = [
      [
        ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'IELTS Reading', 'Study Club'],
        ['Calculus', 'Computer Science', 'Economics', 'Statistics', 'Essay Practice', 'IELTS Speaking', 'Mock Class'],
      ],
      [
        ['Mathematics II', 'Physics II', 'Chemistry II', 'Biology II', 'Academic Reading', 'IELTS Writing', 'Study Club'],
        ['Calculus II', 'Programming', 'Business', 'Data Analysis', 'Essay Coaching', 'IELTS Listening', 'Mock Class'],
      ],
      [
        ['Advanced Math', 'Mechanics', 'Lab Chemistry', 'Genetics', 'Writing Workshop', 'Vocabulary', 'Self Study'],
        ['Algebra', 'Frontend Basics', 'Finance Intro', 'Data Tools', 'Essay Editing', 'Speaking Drill', 'Revision'],
      ],
      [
        ['Math Practice', 'Wave Physics', 'Organic Chem', 'Biology Lab', 'Grammar', 'Reading Drill', 'Self Study'],
        ['Calculus Practice', 'Backend Basics', 'Economics Case', 'Statistics Lab', 'Essay Review', 'Listening Drill', 'Revision'],
      ],
    ];

    const data: Prisma.CourseSlotCreateManyInput[] = [];
    for (let weekOffset = 0; weekOffset < coursesByWeek.length; weekOffset += 1) {
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        for (let weekday = 1; weekday <= 7; weekday += 1) {
          const weekType: WeekType = weekOffset === 0 ? 'THIS_WEEK' : 'NEXT_WEEK';
          data.push({
            weekType,
            weekday: WEEKDAY_ENUMS[weekday - 1],
            timeSlot: TIME_SLOT_ENUMS[rowIndex] ?? 'EVENING',
            weekOffset,
            weekdayIndex: weekday,
            startMinute: rows[rowIndex].startMinute,
            endMinute: rows[rowIndex].endMinute,
            courseName: coursesByWeek[weekOffset][rowIndex][weekday - 1],
          });
        }
      }
    }
    await this.prisma.courseSlot.createMany({ data });
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

  async getUserTimetable(userId: string) {
    const modules = await this.prisma.timetableModule.findMany({
      orderBy: { startDate: 'asc' },
      select: { id: true, startDate: true, endDate: true, rows: true },
    });
    const moduleIds = modules.map((item) => item.id);
    const slots = moduleIds.length
      ? await this.prisma.courseSlot.findMany({
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
              select: { status: true },
            },
          },
          orderBy: [{ weekOffset: 'asc' }, { weekdayIndex: 'asc' }],
        })
      : [];

    const cellMap = new Map<
      string,
      { slotId: string; selectionStatus: SelectionStatus | null; weekOffset: number }
    >();
    for (const slot of slots) {
      const weekdayIndex = slot.weekdayIndex ?? 1;
      const startMinute = slot.startMinute ?? 600;
      const endMinute = slot.endMinute ?? 660;
      const key = `${slot.moduleId}-${startMinute}-${endMinute}-${weekdayIndex}`;
      const existing = cellMap.get(key);
      const status =
        slot.selections.find((item) => item.status === 'APPROVED')?.status ??
        slot.selections.find((item) => item.status === 'PENDING')?.status ??
        null;
      const currentOffset = slot.weekOffset ?? Number.MAX_SAFE_INTEGER;
      if (!existing || currentOffset < existing.weekOffset) {
        cellMap.set(key, {
          slotId: slot.id,
          selectionStatus: status,
          weekOffset: currentOffset,
        });
        continue;
      }
      if (existing.selectionStatus !== 'APPROVED' && status === 'APPROVED') {
        existing.selectionStatus = 'APPROVED';
      } else if (!existing.selectionStatus && status === 'PENDING') {
        existing.selectionStatus = 'PENDING';
      }
    }

    return {
      weekdays: WEEKDAY_LABELS,
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
            };
          }),
        }));
        return {
          id: module.id,
          startDate: `${module.startDate.getFullYear()}-${String(module.startDate.getMonth() + 1).padStart(2, '0')}-${String(module.startDate.getDate()).padStart(2, '0')}`,
          endDate: `${module.endDate.getFullYear()}-${String(module.endDate.getMonth() + 1).padStart(2, '0')}-${String(module.endDate.getDate()).padStart(2, '0')}`,
          rows,
        };
      }),
    };
  }

  async selectCourse(userId: string, slotId: string) {
    await this.prisma.$transaction(async (tx) => {
      const [user, slot] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, select: { id: true } }),
        tx.courseSlot.findUnique({ where: { id: slotId }, select: { id: true } }),
      ]);

      if (!user) {
        throw new BadRequestException('User not found');
      }
      if (!slot) {
        throw new BadRequestException('Course slot not found');
      }

      const existing = await tx.courseSelection.findUnique({
        where: {
          userId_courseSlotId: {
            userId,
            courseSlotId: slotId,
          },
        },
      });
      if (existing) {
        if (existing.status === 'APPROVED') {
          throw new BadRequestException('This course is already approved');
        }
        throw new BadRequestException('This course is already pending approval');
      }

      await tx.courseSelection.create({
        data: {
          userId,
          courseSlotId: slotId,
          status: 'PENDING',
        },
      });
    });

    return { success: true, message: 'Course selected. Waiting for admin approval.' };
  }
}
