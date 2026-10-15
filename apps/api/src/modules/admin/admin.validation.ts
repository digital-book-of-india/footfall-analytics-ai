import mongoose from 'mongoose';

export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

export function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export function validateStatusUpdateInput(status: unknown, reason: unknown): { valid: boolean; error?: string } {
  if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
    return { valid: false, error: 'Status must be ACTIVE or SUSPENDED' };
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    return { valid: false, error: 'Mandatory reason must be at least 5 characters' };
  }
  return { valid: true };
}
