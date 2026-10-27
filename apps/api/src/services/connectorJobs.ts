import crypto from 'crypto';

/**
 * In-memory job queue that lets the cloud API ask a specific on-site Connector to do
 * LAN-only work (probe a camera, scan a recorder's channels, answer a WebRTC offer) —
 * ported from the sibling theaft-ai project's services/connectors/jobs.ts (generic
 * transport plumbing, no theft-specific logic).
 *
 * Intentionally in-memory only: a lost job (e.g. API restart) just surfaces as a
 * CONNECTOR_TIMEOUT to the owner, never a crash.
 */

export type JobType = 'PROBE' | 'DISCOVER' | 'WEBRTC';

export interface ConnectorJob {
  id: string;
  connectorId: string;
  cameraId: string;
  type: JobType;
  streamUrl: string;
  payload: unknown;
  delivered: boolean;
  result: unknown;
  createdAt: number;
}

const JOB_TTL_MS = 3 * 60 * 1000;
const NO_RESULT = Symbol('no-result');

const jobs = new Map<string, ConnectorJob>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function enqueueJob(
  connectorId: string,
  cameraId: string,
  type: JobType,
  streamUrl: string,
  payload: unknown = null
): string {
  sweepExpired();
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    connectorId,
    cameraId,
    type,
    streamUrl,
    payload,
    delivered: false,
    result: NO_RESULT,
    createdAt: Date.now(),
  });
  return id;
}

/** Hands every undelivered, unresulted job for this connector out exactly once. */
export function takePendingJobs(connectorId: string): ConnectorJob[] {
  const pending: ConnectorJob[] = [];
  for (const job of jobs.values()) {
    if (job.connectorId === connectorId && !job.delivered && job.result === NO_RESULT) {
      job.delivered = true;
      pending.push(job);
    }
  }
  return pending;
}

export function completeJob(connectorId: string, jobId: string, result: unknown): boolean {
  const job = jobs.get(jobId);
  if (!job || job.connectorId !== connectorId) return false;
  job.result = result;
  return true;
}

/** Non-consuming read of a job's current state — used for async polling (e.g. channel scans). */
export function peekJob(jobId: string): ConnectorJob | undefined {
  return jobs.get(jobId);
}

/** True once completeJob() has recorded a result for this job (peekJob reads before that point too). */
export function isJobDone(job: ConnectorJob | undefined): boolean {
  return Boolean(job) && job!.result !== NO_RESULT;
}

/**
 * Polls for a job's result, deleting the job (one-shot consumption) either when the
 * result arrives or when the timeout is hit. Callers should choose a timeout shorter
 * than their own caller's HTTP timeout so a stalled connector surfaces as a clean
 * CONNECTOR_TIMEOUT rather than a generic network error.
 */
export async function waitForJob(jobId: string, timeoutMs: number): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = jobs.get(jobId);
    if (job && job.result !== NO_RESULT) {
      jobs.delete(jobId);
      return job.result;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  jobs.delete(jobId);
  return null;
}
