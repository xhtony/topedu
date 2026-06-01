import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
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

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /* ── Users ── */

  @Get('users')
  @HttpCode(HttpStatus.OK)
  getUsers(@Query('role') role?: string) {
    return this.adminService.getUsers(role);
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Get('users/:id')
  @HttpCode(HttpStatus.OK)
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id')
  @HttpCode(HttpStatus.OK)
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetUserPassword(@Param('id') id: string) {
    return this.adminService.resetUserPassword(id);
  }

  @Post('users/:id/recharge')
  @HttpCode(HttpStatus.OK)
  recharge(@Param('id') id: string, @Body() dto: RechargeDto, @Req() req: AuthenticatedRequest) {
    return this.adminService.rechargeBalance(id, dto, req.user.id);
  }

  @Post('users/:id/recharge-reversal')
  @HttpCode(HttpStatus.OK)
  reverseRecharge(@Param('id') id: string, @Body() dto: RechargeReversalDto, @Req() req: AuthenticatedRequest) {
    return this.adminService.reverseRechargeBalance(id, dto, req.user.id);
  }

  @Get('users/:id/recharge-records')
  @HttpCode(HttpStatus.OK)
  getRechargeRecords(@Param('id') id: string) {
    return this.adminService.getRechargeRecords(id);
  }

  @Get('users/:id/financial-ledger')
  @HttpCode(HttpStatus.OK)
  getFinancialLedger(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: 'IN' | 'OUT' | 'ALL',
  ) {
    return this.adminService.getFinancialLedger(id, { from, to, type });
  }

  @Get('users/:id/wallet-reconciliation')
  @HttpCode(HttpStatus.OK)
  getWalletReconciliation(@Param('id') id: string) {
    return this.adminService.getWalletReconciliation(id);
  }

  @Get('users/:id/enrollment-slots')
  @HttpCode(HttpStatus.OK)
  getUserEnrollmentSlots(@Param('id') id: string) {
    return this.adminService.getUserEnrollmentSlots(id);
  }

  @Put('users/:id/enrollment-slots')
  @HttpCode(HttpStatus.OK)
  setUserEnrollmentSlots(@Param('id') id: string, @Body() dto: SetUserEnrollmentSlotsDto) {
    return this.adminService.setUserEnrollmentSlots(id, dto);
  }

  @Get('users/:id/timetable-modules')
  @HttpCode(HttpStatus.OK)
  getUserTimetableModules(@Param('id') id: string) {
    return this.adminService.getUserTimetableModules(id);
  }

  @Get('users/:id/session-list')
  @HttpCode(HttpStatus.OK)
  getUserSessionList(@Param('id') id: string) {
    return this.adminService.getUserSessionList(id);
  }

  @Post('users/:id/check-in')
  @HttpCode(HttpStatus.OK)
  adminCheckIn(@Param('id') id: string, @Body() dto: CheckInDto, @Req() req: AuthenticatedRequest) {
    return this.adminService.adminCheckIn(id, dto, req.user.id);
  }

  @Post('users/:id/leave')
  @HttpCode(HttpStatus.OK)
  adminLeave(@Param('id') id: string, @Body() dto: LeaveDto) {
    return this.adminService.adminRequestLeave(id, dto);
  }

  /* ── Courses ── */

  @Get('courses')
  @HttpCode(HttpStatus.OK)
  getCourses() {
    return this.adminService.getCourses();
  }

  @Post('courses')
  @HttpCode(HttpStatus.CREATED)
  createCourse(@Body() dto: CreateCourseDto) {
    return this.adminService.createCourse(dto);
  }

  @Patch('courses/:id')
  @HttpCode(HttpStatus.OK)
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.adminService.updateCourse(id, dto);
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.OK)
  deleteCourse(@Param('id') id: string) {
    return this.adminService.deleteCourse(id);
  }

  /* ── Timetable Modules ── */

  @Get('timetable-modules')
  @HttpCode(HttpStatus.OK)
  getTimetableModules() {
    return this.adminService.getTimetableModules();
  }

  @Post('timetable-modules')
  @HttpCode(HttpStatus.CREATED)
  createTimetableModule(@Body() dto: SaveTimetableModuleDto) {
    return this.adminService.createTimetableModule(dto);
  }

  @Patch('timetable-modules/:id')
  @HttpCode(HttpStatus.OK)
  updateTimetableModule(@Param('id') id: string, @Body() dto: SaveTimetableModuleDto) {
    return this.adminService.updateTimetableModule(id, dto);
  }

  @Delete('timetable-modules/:id')
  @HttpCode(HttpStatus.OK)
  deleteTimetableModule(@Param('id') id: string) {
    return this.adminService.deleteTimetableModule(id);
  }

  /* ── Enrollments ── */

  @Get('enrollments')
  @HttpCode(HttpStatus.OK)
  getEnrollments(@Query('status') status?: string) {
    return this.adminService.getEnrollments(status);
  }

  @Post('enrollments/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveEnrollment(@Param('id') id: string) {
    return this.adminService.approveEnrollment(id);
  }

  @Post('enrollments/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectEnrollment(@Param('id') id: string) {
    return this.adminService.rejectEnrollment(id);
  }
}
