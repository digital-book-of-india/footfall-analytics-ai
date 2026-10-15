import { deriveCameraStatus } from './admin.service';
import { validateStatusUpdateInput, escapeRegex } from './admin.validation';

describe('Admin Module Unit Tests', () => {
  describe('deriveCameraStatus logic', () => {
    it('returns NEEDS_SETUP when lastHeartbeatAt is null', () => {
      expect(deriveCameraStatus('ONLINE', null)).toBe('NEEDS_SETUP');
    });

    it('enforces OFFLINE when heartbeat is older than 90s', () => {
      const pastTime = new Date(Date.now() - 95000).toISOString();
      expect(deriveCameraStatus('ONLINE', pastTime)).toBe('OFFLINE');
    });

    it('returns DEGRADED if reported so and heartbeat is fresh', () => {
      const freshTime = new Date(Date.now() - 20000).toISOString();
      expect(deriveCameraStatus('DEGRADED', freshTime)).toBe('DEGRADED');
    });

    it('returns ONLINE when heartbeat is fresh and state is normal', () => {
      const freshTime = new Date(Date.now() - 10000).toISOString();
      expect(deriveCameraStatus('ONLINE', freshTime)).toBe('ONLINE');
    });
  });

  describe('Validation logic', () => {
    it('rejects status outside ACTIVE and SUSPENDED', () => {
      const res = validateStatusUpdateInput('ARCHIVED', 'Reason string here');
      expect(res.valid).toBe(false);
    });

    it('rejects short reasons (< 5 chars)', () => {
      const res = validateStatusUpdateInput('SUSPENDED', 'bad');
      expect(res.valid).toBe(false);
    });

    it('escapes dangerous regex chars', () => {
      expect(escapeRegex('Test.Shop (Main)')).toBe('Test\\.Shop\\ \\(Main\\)');
    });
  });
});
