export type PathWorkspaceSelection = {
  buildId: string;
  rotationId: string;
};

function resolveAvailableId(availableIds: string[], requestedId: string | undefined, defaultId: string) {
  const available = new Set(availableIds);
  if (requestedId && available.has(requestedId)) return requestedId;
  if (available.has(defaultId)) return defaultId;
  return availableIds[0];
}

export function resolvePathWorkspaceSelection(args: {
  buildIds: string[];
  rotationIds: string[];
  savedBuildId?: string;
  savedRotationId?: string;
  requestedRotationId?: string;
  defaultBuildId: string;
  defaultRotationId: string;
}): PathWorkspaceSelection | undefined {
  const buildId = resolveAvailableId(args.buildIds, args.savedBuildId, args.defaultBuildId);
  const rotationId = resolveAvailableId(
    args.rotationIds,
    args.requestedRotationId ?? args.savedRotationId,
    args.defaultRotationId,
  );
  return buildId && rotationId ? { buildId, rotationId } : undefined;
}
