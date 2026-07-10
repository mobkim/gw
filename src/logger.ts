function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function log(...args: unknown[]): void {
  const now = new Date();
  const time = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const msg = args.length === 1 ? String(args[0]) : JSON.stringify(args);
  console.log(`${time} — ${msg}`);
}
