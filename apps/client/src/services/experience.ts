// Use the user's own words when no title is supplied. Never invent a memory.
export function memoryTitle(title: string, body: string, maxLength = 120) {
  const text =
    title.trim() ||
    body
      .trim()
      .split(/[\n。！？]/, 1)[0]
      .trim() ||
    body.trim();
  const shortened = text.slice(0, maxLength).replace(/[\uD800-\uDBFF]$/, '');
  return shortened;
}
