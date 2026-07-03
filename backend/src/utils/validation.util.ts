export function isValidEmail(email: string): boolean {
  const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return rx.test(email);
}
