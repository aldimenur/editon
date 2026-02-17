export function highlightSearchText(text: string, search: string) {
  if (typeof search !== "string" || !search.trim()) return text;

  const tokens = search
    .split(/\s+/)
    .filter((token) => token.trim().length > 0)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (tokens.length === 0) return text;

  const pattern = new RegExp(`(${tokens.join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = tokens.some(
          (token) => part.toLowerCase() === token.toLowerCase(),
        );

        return isMatch ? (
          <mark
            key={index}
            className="bg-yellow-300 dark:bg-yellow-600 text-foreground"
          >
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

export function renderTagChips(tags: string | null | undefined) {
  if (!tags) return null;

  const tagArray = tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  if (tagArray.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tagArray.slice(0, 3).map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm text-xs font-semibold leading-none"
        >
          {tag}
        </span>
      ))}
      {tagArray.length > 3 && (
        <span className="inline-flex items-center bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-sm text-xs font-semibold leading-none">
          +{tagArray.length - 3}
        </span>
      )}
    </div>
  );
}
