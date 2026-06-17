import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from 'prisma/prisma.service';
import { HttpException } from '@nestjs/common';

describe('AppController', () => {
  let appController: AppController;
  let mockPrismaService: {
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    mockPrismaService = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return health status', () => {
      const health = appController.getHealth();
      expect(health.status).toBe('ok');
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('ready', () => {
    it('should return ready status when database is healthy', async () => {
      const ready = await appController.getReady();
      expect(ready.status).toBe('ready');
      expect(ready.database).toBe('healthy');
      expect(ready.timestamp).toBeDefined();
    });

    it('should throw an error when database is unhealthy', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Connection lost'),
      );
      await expect(appController.getReady()).rejects.toThrow(HttpException);
    });
  });
});
