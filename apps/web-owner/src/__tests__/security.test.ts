import { describe, it, expect } from 'vitest';
import { maskRtspUrl, maskPassword } from '../utils/security';

describe('Security & Secret Masking Utilities', () => {
  it('masks password in credential-bearing RTSP URLs', () => {
    const rawUrl = 'rtsp://admin:superSecretPass123@192.168.1.100:554/stream1';
    const masked = maskRtspUrl(rawUrl);
    expect(masked).toBe('rtsp://admin:****@192.168.1.100:554/stream1');
    expect(masked).not.toContain('superSecretPass123');
  });

  it('preserves host and path when no credentials exist in RTSP URL', () => {
    const cleanUrl = 'rtsp://192.168.1.50:554/live';
    const masked = maskRtspUrl(cleanUrl);
    expect(masked).toBe('rtsp://192.168.1.50:554/live');
  });

  it('handles username without password safely', () => {
    const userOnly = 'rtsp://operator@10.0.0.12/feed';
    const masked = maskRtspUrl(userOnly);
    expect(masked).toBe('rtsp://operator@10.0.0.12/feed');
  });

  it('masks unknown malformed password patterns safely', () => {
    const malformed = 'custom://user:veryPrivate@host/stream';
    const masked = maskRtspUrl(malformed);
    expect(masked).not.toContain('veryPrivate');
    expect(masked).toContain('****');
  });

  it('generates uniform bullet masking for passwords', () => {
    expect(maskPassword(8)).toBe('••••••••');
    expect(maskPassword(4)).toBe('••••');
  });
});
