import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  RopOptimizationFiltersSchema,
  type RopData,
  type RopOptimizationFilters,
} from '@drilliq/shared';

import { RopService } from './rop.service';

export interface RopOptionsResponse {
  wells: { id: string; name: string }[];
  holeSizes: string[];
  bitFamilies: string[];
  mudTypes: { id: string; name: string }[];
}

@ApiTags('rop')
@Controller('rop-optimization')
export class RopController {
  constructor(private readonly ropService: RopService) {}

  @Post()
  @ApiOperation({
    summary:
      'ROP-optimization dataset: bit runs mapped to operating points with MSE/HSI/cost.',
  })
  @ApiOkResponse({ description: 'ROP-optimization points + facets.' })
  async getRopOptimization(@Body() body: unknown): Promise<RopData> {
    // Validate/parse the body with the SHARED Zod schema (the contract).
    const parsed = RopOptimizationFiltersSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const filters: RopOptimizationFilters = parsed.data;
    return this.ropService.getRopOptimization(filters);
  }

  @Get('options')
  @ApiOperation({
    summary: 'Distinct sidebar facets: wells, hole sizes, bit families, mud types.',
  })
  @ApiOkResponse({ description: 'Filter options for the ROP-optimization sidebar.' })
  async getOptions(): Promise<RopOptionsResponse> {
    return this.ropService.getOptions();
  }
}
