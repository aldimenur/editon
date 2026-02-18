type TaggableAsset = {
  tags?: string | null;
};

function parseTags(tags: string | null | undefined): string[] {
  if (!tags) {
    return [];
  }

  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function getCommonTags(assets: TaggableAsset[]): string | null {
  if (assets.length === 0) {
    return null;
  }

  let common = parseTags(assets[0].tags);

  for (let i = 1; i < assets.length; i += 1) {
    const tagSet = new Set(parseTags(assets[i].tags));
    common = common.filter((tag) => tagSet.has(tag));

    if (common.length === 0) {
      break;
    }
  }

  return common.length > 0 ? common.join(", ") : null;
}
