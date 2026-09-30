import { createHash } from "crypto";

export const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pxL8otSzgjLj6t";
const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(buf: Buffer) {
  let n = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of buf) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

/** 20-byte hex (no 41 prefix) -> TRON base58 address */
export function hexToTron(hex20: string) {
  const payload = Buffer.from("41" + hex20.slice(-40), "hex");
  const h1 = createHash("sha256").update(payload).digest();
  const h2 = createHash("sha256").update(h1).digest();
  return base58(Buffer.concat([payload, h2.subarray(0, 4)]));
}

export type TronCheck =
  | { ok: true; amountUsdt: number; to: string }
  | { ok: false; error: string };

export async function verifyUsdtTransfer(txid: string, expectedTo: string, minUsdt: number): Promise<TronCheck> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env["TRONGRID_API_KEY"];
  if (key) headers["TRON-PRO-API-KEY"] = key;

  let info: any;
  try {
    const res = await fetch("https://api.trongrid.io/wallet/gettransactioninfobyid", {
      method: "POST",
      headers,
      body: JSON.stringify({ value: txid }),
    });
    if (!res.ok) return { ok: false, error: "Blockchain lookup failed. Please try again in a minute." };
    info = await res.json();
  } catch {
    return { ok: false, error: "Could not reach the TRON network. Please try again." };
  }

  if (!info || !info.id) return { ok: false, error: "Transaction not found yet. Wait for confirmation and retry." };
  if (!info.blockNumber) return { ok: false, error: "Transaction is not confirmed yet. Retry shortly." };
  if (info.receipt?.result !== "SUCCESS") return { ok: false, error: "Transaction did not complete successfully on-chain." };

  const contractHex = info.contract_address as string | undefined;
  if (!contractHex || hexToTron(contractHex) !== USDT_CONTRACT) {
    return { ok: false, error: "This transaction is not a USDT (TRC20) transfer." };
  }

  let total = 0n;
  for (const log of info.log ?? []) {
    if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) continue;
    if (hexToTron(log.address) !== USDT_CONTRACT) continue;
    if (hexToTron(log.topics[2]) !== expectedTo) continue;
    total += BigInt("0x" + (log.data || "0"));
  }
  if (total === 0n) return { ok: false, error: "No USDT was sent to the SentinelSec wallet address in this transaction." };

  const amount = Number(total) / 1_000_000;
  if (amount + 1e-9 < minUsdt) {
    return { ok: false, error: `Amount too low: received ${amount} USDT, plan requires ${minUsdt} USDT.` };
  }
  return { ok: true, amountUsdt: amount, to: expectedTo };
}
