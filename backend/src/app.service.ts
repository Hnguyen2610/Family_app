import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { message: string; version: string } {
    return {
      message: 'Welcome to Family Calendar + AI Assistant API',
      version: '1.0.0',
    };
  }
}
