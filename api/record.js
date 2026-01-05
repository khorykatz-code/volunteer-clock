const { randomBytes, randomUUID } = require("crypto");

function makeLogId() {
  return `LOG-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function randomTokenHex(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}

module.exports = async (req, res) => {
  // ---- CORS (so Hoppscotch works) ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { memberId, activityId } = req.body || {};
    if (!memberId || !activityId) {
      return res.status(400).json({ error: "memberId and activityId are required" });
    }

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;

    const activitiesTable = "Work Hour Events and Categories";
    const logsTable = "Work Hour Log 2 (2026+)";

    const activityModeField = "Mode"; // Shift or Attendance
    const activityNameField = "Name";

    // Logs fields (your names)
    const logIdField = "LogID";
    const logMemberLinkField = "MemberNumber";
    const logActivityLinkField = "WHActivity";
    const startField = "StartTime";
    const endField = "EndTime";
    const reminderSentField = "ReminderSentAt";
    const tokenField = "ClockOutToken";
    const tokenExpiresField = "ClockOutTokenExpires";

    // 1) Fetch activity
    const actUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(activitiesTable)}/${activityId}`;
    const actResp = await fetch(actUrl, { headers: { Authorization: `Bearer ${token}` } });
    const actText = await actResp.text();
    if (!actResp.ok) return res.status(actResp.status).json({ error: actText });

    const activity = JSON.parse(actText);
    const mode = activity.fields?.[activityModeField] ?? null;
    const activityName = activity.fields?.[activityNameField] ?? null;

    if (!mode) {
      return res.status(400).json({
        error: `Activity missing "${activityModeField}" (expected Shift or Attendance)`,
        activityId,
        activityName
      });
    }

    const nowIso = new Date().toISOString();

    // 2) Attendance: create closed log immediately
    if (mode === "Attendance") {
      const logId = makeLogId();

      const createUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`;
      const payload = {
        records: [{
          fields: {
            [logIdField]: logId,
            [logMemberLinkField]: [memberId],
            [logActivityLinkField]: [activityId],
            [startField]: nowIso,
            [endField]: nowIso
          }
        }]
      };

      const r2 = await fetch(createUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const t2 = await r2.text();
      if (!r2.ok) return res.status(r2.status).json({ error: t2 });

      const created = JSON.parse(t2);
      return res.status(200).json({
        status: "attendance_recorded",
        logRecordId: created.records?.[0]?.id || null,
        activityName
      });
    }

    // 3) Shift: enforce one open shift per member across all activities
    if (mode === "Shift") {
      const findUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`);
      const filter = `AND(FIND("${memberId}", ARRAYJOIN({${logMemberLinkField}})), {${endField}}=BLANK())`;
      findUrl.searchParams.set("filterByFormula", filter);
      findUrl.searchParams.set("maxRecords", "1");

      const r3 = await fetch(findUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const t3 = await r3.text();
      if (!r3.ok) return res.status(r3.status).json({ error: t3 });

      const openData = JSON.parse(t3);
      const open = openData.records?.[0];
      if (open) {
        return res.status(200).json({
          status: "already_open",
          openLogRecordId: open.id,
          openSince: open.fields?.[startField] || null
        });
      }

      // Create new open shift
      const logId = makeLogId();
      const clockOutToken = randomTokenHex(16);

      const createUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`;
      const payload = {
        records: [{
          fields: {
            [logIdField]: logId,
            [logMemberLinkField]: [memberId],
            [logActivityLinkField]: [activityId],
            [startField]: nowIso,
            [tokenField]: clockOutToken,
            [tokenExpiresField]: addDaysIso(7),
            [reminderSentField]: null
          }
        }]
      };

      const r4 = await fetch(createUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const t4 = await r4.text();
      if (!r4.ok) return res.status(r4.status).json({ error: t4 });

      const created = JSON.parse(t4);
      return res.status(200).json({
        status: "shift_started",
        logRecordId: created.records?.[0]?.id || null,
        activityName
      });
    }

    return res.status(400).json({ error: `Unknown mode "${mode}" (expected Shift or Attendance)` });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
