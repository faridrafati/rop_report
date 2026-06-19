import { Injectable } from '@nestjs/common';

export interface ErpSyncResult {
  status: 'ok' | 'not_configured';
  costRecordsSynced: number;
  inventoryRecordsSynced: number;
  message: string;
}

/**
 * ERP connector (Phase 8, interface-level). Defines the cost/AFE + inventory
 * sync contract; a real connector implements `sync()` against the client's ERP
 * (gated by ERP_BASE_URL) and is idempotent on re-run. No external ERP is wired
 * in this build, so `sync()` reports not_configured.
 */
@Injectable()
export class ErpConnectorService {
  isConfigured(): boolean {
    return Boolean(process.env.ERP_BASE_URL);
  }

  async sync(): Promise<ErpSyncResult> {
    if (!this.isConfigured()) {
      return {
        status: 'not_configured',
        costRecordsSynced: 0,
        inventoryRecordsSynced: 0,
        message: 'No ERP configured (set ERP_BASE_URL). Connector is a typed stub in this build.',
      };
    }
    // A real implementation would pull cost/AFE + inventory and upsert idempotently.
    return { status: 'ok', costRecordsSynced: 0, inventoryRecordsSynced: 0, message: 'No-op (stub).' };
  }
}
