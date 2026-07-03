export function toObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function getTelegramActiveFamilyId(settings: any): string | undefined {
  return toObject(toObject(settings).telegram).activeFamilyId;
}

export function getUserFamilies(user: any) {
  if (!user) return [];
  const families = [...(user.families || [])];
  if (user.family && !families.some((family) => family.id === user.family.id)) {
    families.unshift(user.family);
  }
  return families;
}

export function resolveFamilySelection(families: any[], value: string) {
  const index = Number.parseInt(value, 10);
  if (Number.isInteger(index) && index >= 1 && index <= families.length) {
    return families[index - 1];
  }

  return families.find((family) => family.id === value || family.name.toLowerCase() === value.toLowerCase());
}

export function getActiveFamily(user: any) {
  if (!user) return undefined;
  const families = getUserFamilies(user);
  const activeFamilyId = getTelegramActiveFamilyId(user.notificationSettings);
  return families.find((family) => family.id === activeFamilyId) || user.family || families[0];
}
