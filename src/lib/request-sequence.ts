export function beginLatestRequest(sequence: { current: number }) {
  const requestId = ++sequence.current;
  return () => sequence.current === requestId;
}
