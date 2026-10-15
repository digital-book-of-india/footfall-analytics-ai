// Export all enums & basic types
export * from './enums.js';

// Export API envelopes
export * from './envelope.js';

// Export core domain models
export * from './models.js';

// Export DTOs for Owner, Admin & AI services
export * from './dto.js';

// Aliases for seamless backward compatibility with Developer 1's Owner Panel
import { AuthResponseData, CameraTestResponseData, FootfallSummaryResponseData, HourlyTrafficPoint } from './dto.js';
export type AuthResponse = AuthResponseData;
export type CameraTestResult = CameraTestResponseData;
export type FootfallSummary = FootfallSummaryResponseData;
export type FootfallTimeseriesPoint = HourlyTrafficPoint;
