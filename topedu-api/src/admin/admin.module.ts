import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StudentModule } from '../student/student.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [UsersModule, StudentModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
})
export class AdminModule {}
