// System memory (RAM) in use, for the Now running panel (1.5.3). On Windows "free" is what's available to programs.
import os from 'node:os';

export function ramNow(total = os.totalmem(), free = os.freemem()) {
  const gb = (b) => Math.round(b / 1e8) / 10;
  return { usedGB: gb(total - free), totalGB: gb(total) };
}
