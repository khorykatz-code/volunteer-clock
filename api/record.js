module.exports = async (req, res) => {
  // ---- CORS ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

function makeLogId() {
  return `LOG-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function randomToken(bytes = 16) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const { memberId, activityId } = req.body || {};
    if (!memberId || !activityId) {
      return res.status(400).json({ error: "memberId and activityId are required" });
    }

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;

    // Tables
    const activitiesTable = "Work Hour Events and Categories";
    const logsTable = "Work Hour Log 2 (2026+)";

    // Activity fields
    const activityModeField = "Mode";           // Shift or Attendance
    const activityNameField = "Name";           // shown in UI

    // Logs fields (your names)
    const logIdField = "LogID";
    const logMemberLinkField = "MemberNumber";  // linked to MASTER MEMBERSHIP
    const logActivityLinkField = "WHActivity";  // linked to Activities
    const startField = "StartTime";
    const endField = "EndTime";
    const reminderSentField = "ReminderSentAt";
    const tokenField = "ClockOutToken";
    const tokenExpiresField = "ClockOutTokenExpires";

    // 1) Fetch the activity to decide mode
    {
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(activitiesTable)}/${activityId}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const text = await r.text();
      if (!r.ok) return res.status(r.status).json({ error: text });

      const activity = JSON.parse(text);
      const mode = activity.fields?.[activityModeField] ?? null;
      const activityName = activity.fields?.[activityNameField] ?? null;

      if (!mode) {
        return res.status(400).json({
          error: `Activity is missing "${activityModeField}" (expected Shift or Attendance)`,
          activityId,
          activityName
        });
      }

      const nowIso = new Date().toISOString();

      // 2) Attendance: create a closed log immediately (no reminder token needed)
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
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
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

      // 3) Shift: enforce only one open shift per member across all activities
      if (mode === "Shift") {
        // Find open log: MemberNumber contains memberId AND EndTime is blank
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

        // Create new open shift log
        const logId = makeLogId();
        const clockOutToken = randomToken(16);

        const createUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`;
        const payload = {
          records: [{
            fields: {
              [logIdField]: logId,
              [logMemberLinkField]: [memberId],
              [logActivityLinkField]: [activityId],
              [startField]: nowIso,
              // no EndTime yet
              [tokenField]: clockOutToken,
              [tokenExpiresField]: addDaysIso(7),
              [reminderSentField]: null
            }
          }]
        };

        const r4 = await fetch(createUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
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
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
