async function airtableFetch(url, { method = "GET", token, body } = {}) {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, text, json };
}

function toE164US(phoneRaw) {
  if (typeof phoneRaw !== "string") return null;
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function sendTwilioSMS({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: from, Body: body });

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`Twilio error ${r.status}: ${text}`);
  return true;
}

module.exports = async (req, res) => {
  // Secure the cron endpoint
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const pat = process.env.AIRTABLE_PAT;

    const appBase = process.env.APP_BASE_URL; // e.g. https://volunteer-clock.vercel.app
    const remindAfterMinutes = Number(process.env.REMIND_AFTER_MINUTES || "120");

    const logsTable = "Work Hour Log 2 (2026+)";
    const membersTable = "MASTER MEMBERSHIP";

    // Logs fields
    const startField = "StartTime";
    const endField = "EndTime";
    const reminderSentField = "ReminderSentAt";
    const tokenField = "ClockOutToken";
    const memNumField = "MemNum"; // lookup field in Logs

    // Member fields (your real ones)
    const memberNumField = "MEMBER #";
    const phoneField = "PHONE NUMBER";
    const fullNameField = "Full Name";

    // Find open shifts older than remindAfterMinutes and not yet reminded
    const findUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`);
    findUrl.searchParams.set("pageSize", "50");
    findUrl.searchParams.set(
      "filterByFormula",
      `AND(
        {${endField}}=BLANK(),
        {${reminderSentField}}=BLANK(),
        IS_BEFORE({${startField}}, DATEADD(NOW(), -${remindAfterMinutes}, 'minutes'))
      )`
    );

    const r1 = await airtableFetch(findUrl.toString(), { token: pat });
    if (!r1.ok) return res.status(r1.status).json({ error: r1.text });

    const overdue = r1.json?.records || [];
    let sent = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    for (const log of overdue) {
      const memNum = log.fields?.[memNumField];
      const clockOutToken = log.fields?.[tokenField];

      if (!memNum || !clockOutToken) {
        skipped++;
        continue;
      }

      // Lookup member by MEMBER #
      const mUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(membersTable)}`);
      mUrl.searchParams.set("filterByFormula", `{${memberNumField}}=${Number(memNum)}`);
      mUrl.searchParams.set("maxRecords", "1");

      const rm = await airtableFetch(mUrl.toString(), { token: pat });
      if (!rm.ok) { skipped++; continue; }

      const member = rm.json?.records?.[0];
      const phoneRaw = member?.fields?.[phoneField];
      const phoneE164 = toE164US(phoneRaw);
      const name = member?.fields?.[fullNameField] || "there";

      if (!phoneE164) { skipped++; continue; }

      const link = `${appBase}/api/clockout?token=${encodeURIComponent(clockOutToken)}`;
      const msg = `Hi ${name} — reminder to clock out. Tap here: ${link}`;

      await sendTwilioSMS({ to: phoneE164, body: msg });
      sent++;

      // Mark reminder sent
      const patchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}/${log.id}`;
      await airtableFetch(patchUrl, {
        method: "PATCH",
        token: pat,
        body: { fields: { [reminderSentField]: nowIso } }
      });
    }

    return res.status(200).json({ checked: overdue.length, sent, skipped });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
