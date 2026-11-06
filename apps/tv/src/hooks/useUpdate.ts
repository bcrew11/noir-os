import { useEffect, useState } from 'react';
import { readUpdateStatus, type UpdateStatus } from '../lib/android.ts';

/** Self-update status from the Android launcher (null in browser / server modes). */
export function useUpdateStatus(intervalMs = 60_000): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(() => readUpdateStatus());
  useEffect(() => {
    if (!readUpdateStatus()) return;
    const id = setInterval(() => setStatus(readUpdateStatus()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return status;
}
