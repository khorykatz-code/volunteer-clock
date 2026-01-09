import { CFG } from "./_config.js";

export function airtableUrl(baseId, table) {
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
}

export async function airtableFetch(url, options = {}) {
  const token = process.env.AIRTABLE_PAT;
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  const r = await fetch(url, { ...options, headers });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!r.ok) throw new Error(json?.error?.message || text);
  return json ?? {};
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutesIso(min) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + min);
  return d.toISOString();
}

export function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function randomToken(bytes = 16) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

export async function sendTwilioSms({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", from);
  form.set("Body", body);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const text = await r.text();
  if (!r.ok) throw new Error(text);
  return JSON.parse(text);
}

export { CFG };
