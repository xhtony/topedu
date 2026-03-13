import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

type RequestWithUser = Request & {
  user?: {
    id?: string;
  };
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Admin access only');
    }

    const user = await this.usersService.findById(userId);
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access only');
    }

    return true;
  }
}
