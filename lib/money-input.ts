/** Mantém o estado numérico (ponto decimal) e exibe os centavos em pt-BR. */
export function formatMoneyInput(value: string | number): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2).replace('.', ',') : '0,00';
}

export function parseMoneyDigits(text: string): string {
  const digits = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
  return (Number(digits || '0') / 100).toFixed(2);
}
