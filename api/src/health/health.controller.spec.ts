import { Test, type TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns status "ok"', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('drilliq-api');
    expect(typeof result.time).toBe('string');
    expect(Number.isNaN(Date.parse(result.time))).toBe(false);
  });
});
