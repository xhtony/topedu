import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PublishTimetableDto } from './dto/publish-timetable.dto';
import { AdminService } from './admin.service';
import { UpsertTimetableModuleDto } from './dto/upsert-timetable-module.dto';
import { CreateCourseDto } from './dto/create-course.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private static getUserIdFromReq(req: Request & { user?: { id?: string } }) {
    return req.user?.id;
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  users(@Req() req: Request & { user?: { id?: string } }, @Query('email') email?: string) {
    return this.adminService.getUsers(email, AdminController.getUserIdFromReq(req));
  }

  @Get('timetable')
  @HttpCode(HttpStatus.OK)
  timetable(@Query('weekOffset') weekOffset?: string) {
    const parsed = Number(weekOffset ?? '0');
    return this.adminService.getTimetable(Number.isNaN(parsed) ? 0 : parsed);
  }

  @Get('timetable-modules')
  @HttpCode(HttpStatus.OK)
  timetableModules() {
    return this.adminService.getTimetableModules();
  }

  @Get('courses')
  @HttpCode(HttpStatus.OK)
  courses() {
    return this.adminService.getCourses();
  }

  @Post('courses')
  @HttpCode(HttpStatus.OK)
  createCourse(@Body() dto: CreateCourseDto) {
    return this.adminService.createCourse(dto);
  }

  @Post('courses/:courseId/delete')
  @HttpCode(HttpStatus.OK)
  deleteCourse(@Param('courseId') courseId: string) {
    return this.adminService.deleteCourse(courseId);
  }

  @Post('timetable-modules')
  @HttpCode(HttpStatus.OK)
  createTimetableModule(@Body() dto: UpsertTimetableModuleDto) {
    return this.adminService.createTimetableModule(dto);
  }

  @Patch('timetable-modules/:moduleId')
  @HttpCode(HttpStatus.OK)
  updateTimetableModule(@Param('moduleId') moduleId: string, @Body() dto: UpsertTimetableModuleDto) {
    return this.adminService.updateTimetableModule(moduleId, dto);
  }

  @Post('timetable/publish')
  @HttpCode(HttpStatus.OK)
  publishTimetable(@Body() dto: PublishTimetableDto) {
    return this.adminService.publishTimetable(dto);
  }

  @Get('users/:userId')
  @HttpCode(HttpStatus.OK)
  userDetail(@Param('userId') userId: string) {
    return this.adminService.getUserDetail(userId);
  }

  @Get('users/:userId/timetable-modules')
  @HttpCode(HttpStatus.OK)
  userTimetableModules(@Param('userId') userId: string) {
    return this.adminService.getUserTimetableModules(userId);
  }

  @Post('selections/:selectionId/approve')
  @HttpCode(HttpStatus.OK)
  approveSelection(@Param('selectionId') selectionId: string) {
    return this.adminService.approveSelection(selectionId);
  }

  @Post('selections/:selectionId/reject')
  @HttpCode(HttpStatus.OK)
  rejectSelection(@Param('selectionId') selectionId: string) {
    return this.adminService.rejectSelection(selectionId);
  }
}
