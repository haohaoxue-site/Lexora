export function formatChatRunDuration(
  startedAt: string,
  completedAt: string | null,
  now: number,
): string {
  const start = Date.parse(startedAt)
  const end = completedAt ? Date.parse(completedAt) : now
  const seconds = Math.max(1, Math.round(Math.max(0, end - start) / 1_000))
  if (seconds < 60)
    return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
}
