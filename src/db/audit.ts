// Immutable Audit Trail Infrastructure for Smart Pharmacy ERP
// Records every business-critical mutation within atomic transactions

import { AuditLog } from '../types';

export class AuditManager {
  static createLog(
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    deviceId = 'DEVICE-LOCAL',
    options?: {
      reason?: string;
      payloadBefore?: any;
      payloadAfter?: any;
    }
  ): AuditLog {
    return {
      id: 'aud-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString().slice(-4),
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
      payload_before: options?.payloadBefore ? JSON.stringify(options.payloadBefore) : undefined,
      payload_after: options?.payloadAfter ? JSON.stringify(options.payloadAfter) : undefined,
      reason: options?.reason,
      device_id: deviceId,
      created_at: Date.now()
    };
  }
}
