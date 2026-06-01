import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [UsersModule],
  controllers: [StudentController],
  providers: [StudentService, RolesGuard],
  exports: [StudentService],
})
export class StudentModule {}
