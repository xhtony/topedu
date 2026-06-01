import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { RecordSource } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StudentService } from './student.service';
import { EnrollDto } from './dto/enroll.dto';
import { CheckInDto } from './dto/check-in.dto';
import { LeaveDto } from './dto/leave.dto';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller('student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STUDENT')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('schedule')
  @HttpCode(HttpStatus.OK)
  getSchedule(@Req() req: AuthenticatedRequest) {
    return this.studentService.getSchedule(req.user.id);
  }

  @Get('timetable')
  @HttpCode(HttpStatus.OK)
  getTimetable(@Req() req: AuthenticatedRequest) {
    return this.studentService.getTimetableView(req.user.id);
  }

  @Get('session-list')
  @HttpCode(HttpStatus.OK)
  getSessionList(@Req() req: AuthenticatedRequest) {
    return this.studentService.getSessionList(req.user.id);
  }

  @Get('balance')
  @HttpCode(HttpStatus.OK)
  getBalance(@Req() req: AuthenticatedRequest) {
    return this.studentService.getBalance(req.user.id);
  }

  @Get('wallet')
  @HttpCode(HttpStatus.OK)
  getWallet(@Req() req: AuthenticatedRequest) {
    return this.studentService.getWalletSummary(req.user.id);
  }

  @Get('enrollments')
  @HttpCode(HttpStatus.OK)
  getEnrollments(@Req() req: AuthenticatedRequest) {
    return this.studentService.getEnrollments(req.user.id);
  }

  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  enroll(@Req() req: AuthenticatedRequest, @Body() dto: EnrollDto) {
    return this.studentService.enroll(req.user.id, dto);
  }

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  checkIn(@Req() req: AuthenticatedRequest, @Body() dto: CheckInDto) {
    return this.studentService.checkIn(req.user.id, dto, {
      operatorId: req.user.id,
      recordSource: RecordSource.STUDENT,
    });
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  requestLeave(@Req() req: AuthenticatedRequest, @Body() dto: LeaveDto) {
    return this.studentService.requestLeave(req.user.id, dto);
  }

  @Get('attendances')
  @HttpCode(HttpStatus.OK)
  getAttendances(@Req() req: AuthenticatedRequest) {
    return this.studentService.getAttendances(req.user.id);
  }
}
