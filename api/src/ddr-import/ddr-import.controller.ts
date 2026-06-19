import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DdrImportService } from './ddr-import.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';

/** Minimal shape of a multer in-memory upload (avoids an Express type import). */
interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

function assertPdf(file: UploadedPdf | undefined): asserts file is UploadedPdf {
  if (!file || !file.buffer?.length) {
    throw new BadRequestException('No file uploaded (expected multipart field "file").');
  }
  const isPdf =
    file.mimetype === 'application/pdf' ||
    /\.pdf$/i.test(file.originalname) ||
    file.buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!isPdf) throw new BadRequestException('Uploaded file is not a PDF.');
}

const UPLOAD = { limits: { fileSize: 25 * 1024 * 1024 } }; // 25 MB cap

@ApiTags('ddr-import')
@ApiBearerAuth()
@Controller('ddr-import')
export class DdrImportController {
  constructor(private readonly svc: DdrImportService) {}

  @Post('parse')
  @HttpCode(200)
  @Roles('OFFICE_ENGINEER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Parse a Daily Drilling Report PDF and return the extracted data (no DB write).' })
  @UseInterceptors(FileInterceptor('file', UPLOAD))
  async parse(@UploadedFile() file: UploadedPdf) {
    assertPdf(file);
    return this.svc.parse(file.buffer);
  }

  @Post()
  @HttpCode(201)
  @Roles('OFFICE_ENGINEER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Import a Daily Drilling Report PDF into the database (well, DDR, activities, fluid, bit run).' })
  @UseInterceptors(FileInterceptor('file', UPLOAD))
  async import(@CurrentUser() user: JwtUser, @UploadedFile() file: UploadedPdf) {
    assertPdf(file);
    return this.svc.import(user, file.buffer, file.originalname);
  }
}
