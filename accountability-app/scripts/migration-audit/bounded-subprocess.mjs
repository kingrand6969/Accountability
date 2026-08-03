import { spawnSync } from 'node:child_process';

export function runBoundedSubprocess(
  executable, args, { timeoutMs, maxBufferBytes }, spawn = spawnSync,
) {
  if (
    typeof executable !== 'string' ||
    !Array.isArray(args) ||
    args.some((argument) => typeof argument !== 'string') ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
    !Number.isSafeInteger(maxBufferBytes) || maxBufferBytes < 1
  ) throw new Error('Bounded subprocess arguments rejected.');
  return spawn(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: maxBufferBytes,
  });
}
