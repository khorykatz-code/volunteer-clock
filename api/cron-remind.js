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

function computeExpectedEndIso(startIso, maxMinutes) {
  const s = new Date(startIso);
  const e = new Date(s.getTime() + Number(maxMinutes) * 60 * 1000);
  return e.toISOString();
}

module.exports = async (req, res) => {
  // Secure the endpoint
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const pat = process.env.AIRTABLE_PAT;
    if (!baseId || !pat) {
      return res.status(500).json({ error: "Missing AIRTABLE_BASE_ID or AIRTABLE_PAT" });
    }

    const logsTable = "Work Hour Log 2 (2026+)";

    // Fields in Logs
    const startField = "StartTime";
    const endField = "EndTime";
    const maxMinutesField = "AutoCloseMaxMinutes"; // lookup from Activities.MaxMinutes

    // Audit fields in Logs
    const autoClosedCheckbox = "AutoClosed?";
    const autoClosedAtField = "AutoClosedAt";
    const autoCloseReasonField = "AutoCloseReason";

    const now = new Date();
    const nowIso = now.toISOString();

    // Fetch candidate open logs that have an auto-close duration
    const findUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`);
    findUrl.searchParams.set("pageSize", "100");
    findUrl.searchParams.set(
      "filterByFormula",
      `AND(
        {${endField}}=BLANK(),
        {${maxMinutesField}},
        {${startField}}
      )`
    );

    const r1 = await airtableFetch(findUrl.toString(), { token: pat });
    if (!r1.ok) return res.status(r1.status).json({ error: r1.text });

    const candidates = r1.json?.records || [];

    let checked = 0;
    let autoClosed = 0;
    let skippedNotDueYet = 0;
    let skippedBadData = 0;
    let errors = 0;

    for (const log of candidates) {
      checked++;

      const startIso = log.fields?.[startField];
      const maxMin = log.fields?.[maxMinutesField];

      if (!startIso || maxMin == null || maxMin === "") {
        skippedBadData++;
        continue;
      }

      const expectedEndIso = computeExpectedEndIso(startIso, maxMin);
      const expectedEnd = new Date(expectedEndIso);

      // Only close if we've passed the expected end time
      if (now.getTime() < expectedEnd.getTime()) {
        skippedNotDueYet++;
        continue;
      }

      const patchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}/${log.id}`;
      const patchBody = {
        fields: {
          [endField]: expectedEndIso,          // closes at predefined expected end time
          [autoClosedCheckbox]: true,
          [autoClosedAtField]: nowIso,
          [autoCloseReasonField]: "MaxDuration"
        }
      };

      const r2 = await airtableFetch(patchUrl, { method: "PATCH", token: pat, body: patchBody });
      if (!r2.ok) {
        errors++;
        continue;
      }

      autoClosed++;
    }

    return res.status(200).json({
      ok: true,
      now: nowIso,
      checked,
      candidates: candidates.length,
      autoClosed,
      skippedNotDueYet,
      skippedBadData,
      errors
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
