import { BadRequestException, Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { WitsmlService } from './witsml.service';
import { ErpConnectorService } from './erp.service';
import { getSsoConfig } from './sso.config';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';

interface XmlResponse {
  set(headers: Record<string, string>): unknown;
  send(body: string): unknown;
}

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly witsml: WitsmlService,
    private readonly erp: ErpConnectorService,
  ) {}

  @Get('witsml/export')
  @ApiOperation({ summary: 'Export the tenant as WITSML 1.4.1.1 XML (well → wellbore → bitRecord).' })
  async witsmlExport(@Res() res: XmlResponse): Promise<void> {
    const xml = await this.witsml.exportXml();
    res.set({ 'Content-Type': 'application/xml', 'Content-Disposition': 'attachment; filename="drilliq-witsml.xml"' });
    res.send(xml);
  }

  @Post('witsml/import')
  @Roles('OFFICE_ENGINEER', 'MANAGEMENT')
  @ApiOperation({ summary: 'Import WITSML XML (upsert by uid, RLS-scoped, idempotent). Body: { xml }.' })
  async witsmlImport(@CurrentUser() user: JwtUser, @Body() body: { xml?: unknown }) {
    if (typeof body?.xml !== 'string' || !body.xml.trim()) {
      throw new BadRequestException('Body must include an `xml` string.');
    }
    return this.witsml.importXml(user, body.xml);
  }

  @Get('sso/config')
  @ApiOperation({ summary: 'Entra ID / OIDC SSO configuration status + group→role mapping.' })
  ssoConfig() {
    return getSsoConfig();
  }

  @Post('erp/sync')
  @Roles('MANAGEMENT')
  @ApiOperation({ summary: 'Trigger ERP cost/inventory sync (stub connector in this build).' })
  erpSync() {
    return this.erp.sync();
  }
}
