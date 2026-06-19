import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';

import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RopModule } from './rop/rop.module';
import { CaptureModule } from './capture/capture.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PlansModule } from './plans/plans.module';
import { ReportsModule } from './reports/reports.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { DdrImportModule } from './ddr-import/ddr-import.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Request-scoped context (AsyncLocalStorage) holding the verified tenant id.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    AuthModule,
    HealthModule,
    RopModule,
    CaptureModule,
    DashboardModule,
    PlansModule,
    ReportsModule,
    IntegrationsModule,
    DdrImportModule,
  ],
  providers: [
    // Global auth: every route requires a valid JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global RBAC: routes with @Roles(...) are restricted accordingly.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
