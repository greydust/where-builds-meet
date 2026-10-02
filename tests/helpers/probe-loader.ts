// Runtime loader for probe specs that are only known dynamically (rotation
// paths, skill-file loops). Static specifiers are imported directly; this
// helper covers the remaining computed cases. Probe specs are root-absolute
// (`/src/...`, `/data/...`); this helper lives in tests/helpers/, two levels
// below the root like the former script/probe/ checks did relative to theirs,
// so a `../..` prefix resolves them.
//
// The module is named by the caller: a computed specifier resolves to `any`, and
// everything a spec destructured from here was unchecked until each one said
// which module it meant.
export const probeLoad = <M>(path: string): Promise<M> => import(/* @vite-ignore */ `../..${path}`) as Promise<M>
