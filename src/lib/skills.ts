export function normalizeSkillName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function uniqueSkillNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const cleanName = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeSkillName(cleanName);
    if (!normalizedName || seen.has(normalizedName)) return [];
    seen.add(normalizedName);
    return [cleanName];
  });
}