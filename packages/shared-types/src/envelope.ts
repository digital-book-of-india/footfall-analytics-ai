import { ErrorCode } from './enums.js';

/**
 * Standard API Success Envelope
 * Requirement: { success: true, data: {...}, requestId: "..." }
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

/**
 * Standard API Error Envelope
 * Requirement: { success: false, error: { code: "...", message: "..." }, requestId: "..." }
 */
export interface ApiError {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

/**
 * Common Paginated List Envelope Data
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
