export function isValidDraft(draft: string, allowEmpty: boolean, min?: number, max?: number) {
  if (draft === "") return allowEmpty
  const number = Number(draft)
  if (!Number.isFinite(number)) return false
  if (min !== undefined && number < min) return false
  if (max !== undefined && number > max) return false
  return true
}

export function commitDraft(
  raw: string | undefined,
  options: { allowEmpty?: boolean; min?: number; max?: number },
): number | undefined {
  if (raw === undefined) return undefined
  if (options.allowEmpty === true && raw === "") return undefined
  const number = Number(raw)
  const fallback = options.min ?? 0
  const finite = Number.isFinite(number) ? number : fallback
  return Math.min(options.max ?? Infinity, Math.max(fallback, finite))
}
