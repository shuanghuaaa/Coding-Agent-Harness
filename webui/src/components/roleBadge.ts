export function roleBadgeClass(role?: string): string {
  if (role === 'coder') return 'coder';
  if (role === 'reviewer') return 'reviewer';
  if (role === 'tester') return 'tester';
  return '';
}
