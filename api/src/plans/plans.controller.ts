import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApprovalDecisionSchema,
  CreatePlanSchema,
  CreateRecommendationSchema,
} from '@drilliq/shared';

import { PlansService } from './plans.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';

@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Post()
  @HttpCode(201)
  @Roles('OFFICE_ENGINEER')
  @ApiOperation({ summary: 'Create an engineering plan (Office Engineer).' })
  async create(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    const parsed = CreatePlanSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.plans.createPlan(user, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: 'List plans (RLS-scoped).' })
  list() {
    return this.plans.listPlans();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a plan with recommendations + approval history.' })
  getOne(@Param('id') id: string) {
    return this.plans.getPlan(id);
  }

  @Post(':id/recommendations')
  @HttpCode(201)
  @Roles('OFFICE_ENGINEER')
  @ApiOperation({ summary: 'Add a recommendation (bit + parameter window) to a plan.' })
  async addRec(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = CreateRecommendationSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.plans.addRecommendation(user, id, parsed.data);
  }

  @Post(':id/submit')
  @Roles('OFFICE_ENGINEER')
  @ApiOperation({ summary: 'Submit a plan for approval (DRAFT/REJECTED → PROPOSED).' })
  submit(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.plans.submit(user, id);
  }

  @Post(':id/approve')
  @Roles('MANAGEMENT')
  @ApiOperation({ summary: 'Approve a proposed plan (Management).' })
  async approve(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = ApprovalDecisionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.plans.decide(user, id, true, parsed.data);
  }

  @Post(':id/reject')
  @Roles('MANAGEMENT')
  @ApiOperation({ summary: 'Reject a proposed plan (Management).' })
  async reject(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = ApprovalDecisionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.plans.decide(user, id, false, parsed.data);
  }
}
