export type TimelineAwareScriptDefinition = {
  altersTimeline?: boolean;
};

export function scriptSelectionChangesTimeline(
  current: string,
  replacement: string,
  definitions: Record<string, TimelineAwareScriptDefinition>,
): boolean {
  if (current === replacement) return false;
  return definitions[current]?.altersTimeline === true || definitions[replacement]?.altersTimeline === true;
}
