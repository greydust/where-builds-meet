const shareHashKey = "build"

/**
 * A build link carries its payload in the fragment rather than the query, so opening it never
 * sends the build to the host and a static deployment serves the same page. The payload is
 * deflated because a whole build is several kilobytes of repeated affix keys.
 */
export async function buildShareLink(exported: string) {
  const compressed = await transform(new TextEncoder().encode(exported), new CompressionStream("deflate-raw"))
  return `${location.origin}${location.pathname}#${shareHashKey}=${base64UrlEncode(compressed)}`
}

/** Whether the current URL carries a shared build, which is enough to offer the import. */
export function hasSharedBuild() {
  return new URLSearchParams(location.hash.slice(1)).has(shareHashKey)
}

/** The payload named by the current URL, or `undefined` when the URL shares nothing. */
export async function readSharedBuild(): Promise<unknown> {
  const encoded = new URLSearchParams(location.hash.slice(1)).get(shareHashKey)
  if (encoded === null) return undefined
  const decompressed = await transform(base64UrlDecode(encoded), new DecompressionStream("deflate-raw"))
  return JSON.parse(new TextDecoder().decode(decompressed)) as unknown
}

/** Drops the fragment once the recipient has answered, so a reload does not ask again. */
export function clearSharedBuild() {
  if (!hasSharedBuild()) return
  history.replaceState(null, "", location.pathname + location.search)
}

async function transform(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
  return new Uint8Array(await new Response(body.pipeThrough(stream)).arrayBuffer())
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
