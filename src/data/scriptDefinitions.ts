export type TimelineAwareSetupDefinition = {
  altersTimeline?: boolean;
};

export function setupSelectionChangesTimeline(
  current: string,
  replacement: string,
  definitions: Record<string, TimelineAwareSetupDefinition>,
): boolean {
  if (current === replacement) return false;
  return definitions[current]?.altersTimeline === true || definitions[replacement]?.altersTimeline === true;
}
