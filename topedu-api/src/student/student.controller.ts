import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SelectCourseDto } from './dto/select-course.dto';
import { StudentService } from './student.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller('student')
@UseGuards(JwtAuthGuard)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('timetable')
  @HttpCode(HttpStatus.OK)
  timetable(@Req() req: AuthenticatedRequest) {
    return this.studentService.getUserTimetable(req.user.id);
  }

  @Post('select-course')
  @HttpCode(HttpStatus.OK)
  selectCourse(@Req() req: AuthenticatedRequest, @Body() dto: SelectCourseDto) {
    return this.studentService.selectCourse(req.user.id, dto.slotId);
  }
}
