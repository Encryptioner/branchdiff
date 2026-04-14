/**
 * Health check endpoint handler.
 * Returns server status and uptime information.
 */

export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
}

let startTime = Date.now();

export function resetStartTime(): void {
  startTime = Date.now();
}

export function getHealthStatus(): HealthStatus {
  return {
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };
}
