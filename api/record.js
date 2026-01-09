const { randomBytes, randomUUID } = require("crypto");

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function randomTokenHex(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}

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
  try { json = JSON.parse(text); } catch { /* ignore */ }

  return { ok: r.ok, status: r.status, text, json };
}

function isUnknownFieldError(resp) {
  // Airtable errors look like: {"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \"EndTime\""}}
  return resp?.json?.error?.type === "UNKNOWN_FIELD_NAME";
}

// ✅ Robust minutes parser (handles number, "30", "30 minutes", [30], ["30"])
function coerceMinutes(value) {
  if (value == null) return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return coerceMinutes(value[0]);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;

    const n1 = Number(s);
    if (Number.isFinite(n1)) return n1;

    const m = s.match(/(\d+(\.\d+)?)/);
    if (m) {
      const n2 = Number(m[1]);
      if (Number.isFinite(n2)) return n2;
    }
    return null;
  }

  return null;
}

module.exports = async (req, res) => {
  // ---- CORS (so browser tools + your future web UI work) ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { memberId, memberNumber, activityId } = req.body || {};

    if (!memberId || !activityId) {
      return res.status(400).json({ error: "memberId and activityId are required" });
    }
    const memberNumStr = String(memberNumber ?? "").trim();
    if (!/^\d{1,4}$/.test(memberNumStr)) {
      return res.status(400).json({ error: "memberNumber is required (1–4 digits)" });
    }
    const memberNum = Number(memberNumStr);

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;
    if (!baseId || !token) {
      return res.status(500).json({ error: "Missing AIRTABLE_BASE_ID or AIRTABLE_PAT" });
    }

    // Tables
    const activitiesTable = "Work Hour Events and Categories";
    const logsTable = "Work Hour Log 2 (2026+)";

    // Activity fields
    const activityModeField = "Mode"; // Shift or Attendance
    const activityNameField = "Name";
    const activityAutoCloseMaxMinutesField = "AutoCloseMaxMinutes"; // ✅ YOUR REAL FIELD

    // Logs fields (your names)
    const logIdField = "LogID";                // writable now (you changed it to short text)
    const logMemberLinkField = "MemberNumber"; // linked to MASTER MEMBERSHIP
    const logActivityLinkField = "WHActivity"; // linked to Activities
    const startField = "StartTime";
    const memNumLookupField = "MemNum";        // lookup in Logs

    // End field name can vary; we’ll try a few common ones until Airtable accepts it
    const endFieldCandidates = [
      "EndTime",
      "End Time",
      "End",
      "Clock Out",
      "ClockOut",
      "Checked Out",
      "CheckedOut"
    ];

    // Token fields
    const reminderSentField = "ReminderSentAt";
    const tokenField = "ClockOutToken";
    const tokenExpiresField = "ClockOutTokenExpires";

    // 1) Fetch activity to decide mode
    const actUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(activitiesTable)}/${activityId}`;
    const actResp = await airtableFetch(actUrl, { token });
    if (!actResp.ok) return res.status(actResp.status).json({ error: actResp.text });

    const activity = actResp.json;
    const activityFields = activity?.fields || {};
    const mode = activityFields?.[activityModeField] ?? null;
    const activityName = activityFields?.[activityNameField] ?? null;

    if (!mode) {
      return res.status(400).json({
        error: `Activity missing "${activityModeField}" (expected Shift or Attendance)`,
        activityId,
        activityName
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Helper: find open shift for this member using MemNum lookup + End field candidates
    async function findOpenShift() {
      for (const endField of endFieldCandidates) {
        const findUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`);
        const filter = `AND({${memNumLookupField}}=${memberNum}, {${endField}}=BLANK())`;
        findUrl.searchParams.set("filterByFormula", filter);
        findUrl.searchParams.set("maxRecords", "1");

        const r = await airtableFetch(findUrl.toString(), { token });
        if (r.ok) {
          const open = r.json?.records?.[0] || null;
          return { open, endFieldUsed: endField };
        }

        // If Airtable says that endField doesn't exist, try the next candidate.
        if (isUnknownFieldError(r)) continue;

        // Other errors: stop and report
        throw new Error(r.text);
      }
      // If none matched, give a clear error
      throw new Error(
        `Could not find a valid end-time field. Tried: ${endFieldCandidates.join(", ")}`
      );
    }

    // Helper: create attendance record (needs end field, so also uses candidates)
    async function createAttendanceLog(endIso) {
      for (const endField of endFieldCandidates) {
        const createUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`;
        const payload = {
          records: [{
            fields: {
              [logIdField]: `LOG-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
              [logMemberLinkField]: [memberId],
              [logActivityLinkField]: [activityId],
              [startField]: nowIso,
              [endField]: endIso
            }
          }]
        };

        const r = await airtableFetch(createUrl, { method: "POST", token, body: payload });
        if (r.ok) {
          return { created: r.json, endFieldUsed: endField };
        }
        if (isUnknownFieldError(r)) continue;
        throw new Error(r.text);
      }

      throw new Error(
        `Could not create attendance log; no valid end field found. Tried: ${endFieldCandidates.join(", ")}`
      );
    }

    // 2) Attendance: create closed log immediately with end = now + AutoCloseMaxMinutes
    if (String(mode).trim() === "Attendance") {
      const rawMax = activityFields?.[activityAutoCloseMaxMinutesField];
      const maxMinutes = coerceMinutes(rawMax);

      const endIso =
        Number.isFinite(maxMinutes) && maxMinutes > 0
          ? new Date(now.getTime() + maxMinutes * 60 * 1000).toISOString()
          : nowIso;

      const { created, endFieldUsed } = await createAttendanceLog(endIso);

      return res.status(200).json({
        status: "attendance_recorded",
        logRecordId: created?.records?.[0]?.id || null,
        activityName,
        endFieldUsed,

        // helpful for debugging:
        autoCloseMaxMinutes: maxMinutes ?? null,
        autoCloseMaxMinutesRaw: rawMax ?? null,
        attendanceEndIso: endIso
      });
    }

    // 3) Shift: enforce one open shift per member
    if (String(mode).trim() === "Shift") {
      const { open, endFieldUsed } = await findOpenShift();

      if (open) {
        return res.status(200).json({
          status: "already_open",
          openLogRecordId: open.id,
          openSince: open.fields?.[startField] || null,
          endFieldUsed
        });
      }

      // Create new open shift
      const logId = `LOG-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
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

      const r = await airtableFetch(createUrl, { method: "POST", token, body: payload });
      if (!r.ok) return res.status(r.status).json({ error: r.text });

      return res.status(200).json({
        status: "shift_started",
        logRecordId: r.json?.records?.[0]?.id || null,
        activityName
      });
    }

    return res.status(400).json({ error: `Unknown mode "${mode}" (expected Shift or Attendance)` });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
