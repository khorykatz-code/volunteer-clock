// api/record.js
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const cfg = require("./_config");

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY;
    const BASE_ID = cfg.BASE_ID || process.env.AIRTABLE_BASE_ID;

    const LOGS_TABLE = cfg.LOGS_TABLE || "Work Hour Log 2 (2026+)";
    const ACTIVITIES_TABLE = cfg.ACTIVITIES_TABLE || "Work Hour Events and Categories";

    // Logs fields
    const LOG_ID_FIELD = cfg.LOG_ID_FIELD || "LogID";
    const LOG_MEMBER_LINK_FIELD = cfg.LOG_MEMBER_LINK_FIELD || "MemberNumber"; // could be link
    const LOG_MEMBER_NUM_FIELD = cfg.LOG_MEMBER_NUM_FIELD || "MemNum";         // optional numeric copy
    const LOG_ACTIVITY_LINK_FIELD = cfg.LOG_ACTIVITY_LINK_FIELD || "WHActivity";
    const LOG_START_FIELD = cfg.LOG_START_FIELD || "StartTime";
    const LOG_END_FIELD = cfg.LOG_END_FIELD || "EndTime";

    // Activities fields
    const ACT_NAME_FIELD = cfg.ACT_NAME_FIELD || "Name";
    const ACT_MODE_FIELD = cfg.ACT_MODE_FIELD || "Mode";
    const ACT_MAX_MINUTES_FIELD = cfg.ACT_MAX_MINUTES_FIELD || "MaxMinutes";         // Attendance duration
    const ACT_AUTOCLOSE_FIELD = cfg.ACT_AUTOCLOSE_FIELD || "AutoCloseMaxMinutes";    // Shift autoclose duration

    if (!AIRTABLE_PAT) {
      return res.status(500).json({ error: "Missing AIRTABLE_PAT env var" });
    }
    if (!BASE_ID) {
      return res.status(500).json({ error: "Missing BASE_ID (set in _config.js or AIRTABLE_BASE_ID)" });
    }

    const body = await readJson(req);
    const memberId = body?.memberId || null;
    const memberNumber = body?.memberNumber ?? null; // numeric
    const activityId = body?.activityId || null;

    if (!memberId || !activityId) {
      return res.status(400).json({ error: "memberId and activityId are required" });
    }
    if (memberNumber === null || memberNumber === undefined || Number.isNaN(Number(memberNumber))) {
      return res.status(400).json({ error: "memberNumber is required (numeric)" });
    }

    // 1) Load activity (to know Mode + durations)
    const activity = await airtableGet({
      pat: AIRTABLE_PAT,
      baseId: BASE_ID,
      table: ACTIVITIES_TABLE,
      recordId: activityId,
    });

    const aFields = activity.fields || {};
    const activityName = aFields[ACT_NAME_FIELD] ?? "Activity";
    const activityMode = aFields[ACT_MODE_FIELD] ?? "Shift";
    const maxMinutesRaw = aFields[ACT_MAX_MINUTES_FIELD];
    const autoCloseRaw = aFields[ACT_AUTOCLOSE_FIELD];

    const maxMinutes = toIntOrNull(maxMinutesRaw);
    const autoCloseMinutes = toIntOrNull(autoCloseRaw);

    // 2) Enforce ONE open shift per member globally (EndTime is blank)
    // We use memberNumber match via LOG_MEMBER_NUM_FIELD if present, else attempt on the link field too.
    // If your open-shift logic uses a different field, update _config.js values.
    const filter = `AND(` +
      `OR({${LOG_MEMBER_NUM_FIELD}}=${Number(memberNumber)}, {${LOG_MEMBER_LINK_FIELD}}=${Number(memberNumber)}),` +
      `OR({${LOG_END_FIELD}}="", {${LOG_END_FIELD}}=BLANK())` +
      `)`;

    const open = await airtableList({
      pat: AIRTABLE_PAT,
      baseId: BASE_ID,
      table: LOGS_TABLE,
      filterByFormula: filter,
      maxRecords: 1,
      sortField: LOG_START_FIELD,
      sortDir: "desc",
    });

    if ((open.records || []).length > 0) {
      const openRec = open.records[0];
      const openStart = openRec.fields?.[LOG_START_FIELD] || null;

      // ✅ For Attendance: we do NOT want to create another record if already open.
      // Your kiosk has "auto clock-out then clock-in" toggle; it uses /api/signout for that.
      return res.status(200).json({
        status: "already_open",
        openLogRecordId: openRec.id,
        openSince: openStart,
        endFieldUsed: LOG_END_FIELD,
      });
    }

    // 3) Create log record
    const now = Date.now();
    const startIso = new Date(now).toISOString();

    // Attendance: EndTime = Start + MaxMinutes (if MaxMinutes missing, treat as 0 => same time)
    if (String(activityMode).toLowerCase() === "attendance") {
      const mins = maxMinutes && maxMinutes > 0 ? maxMinutes : 0;
      const endIso = mins > 0 ? new Date(now + mins * 60 * 1000).toISOString() : startIso;

      const fields = {};
      fields[LOG_ACTIVITY_LINK_FIELD] = [activityId];
      fields[LOG_START_FIELD] = startIso;
      fields[LOG_END_FIELD] = endIso;

      // store member link (Airtable linked record expects array of record ids)
      fields[LOG_MEMBER_LINK_FIELD] = [memberId];

      // optional numeric copy if you have it
      if (LOG_MEMBER_NUM_FIELD) fields[LOG_MEMBER_NUM_FIELD] = Number(memberNumber);

      // if LogID is a plain text primary, set something deterministic-ish
      if (LOG_ID_FIELD) fields[LOG_ID_FIELD] = `L-${memberNumber}-${Date.now()}`;

      const created = await airtableCreate({
        pat: AIRTABLE_PAT,
        baseId: BASE_ID,
        table: LOGS_TABLE,
        fields,
      });

      return res.status(200).json({
        status: "attendance_recorded",
        logRecordId: created.id,
        activityName,
        startedAt: startIso,
        endedAt: endIso,
        minutesUsed: mins,
      });
    }

    // Shift mode: StartTime now, EndTime left blank for manual signout or nightly auto-close
    {
      const fields = {};
      fields[LOG_ACTIVITY_LINK_FIELD] = [activityId];
      fields[LOG_START_FIELD] = startIso;

      // member link
      fields[LOG_MEMBER_LINK_FIELD] = [memberId];

      // optional numeric copy
      if (LOG_MEMBER_NUM_FIELD) fields[LOG_MEMBER_NUM_FIELD] = Number(memberNumber);

      // optional LogID
      if (LOG_ID_FIELD) fields[LOG_ID_FIELD] = `L-${memberNumber}-${Date.now()}`;

      // (optional) if you want to store the activity's autoclose minutes in the log for cron:
      // if you have a field for that, add it here. Otherwise cron can lookup via linked activity.
      // Example:
      // const LOG_AUTOCLOSE_MINUTES_FIELD = cfg.LOG_AUTOCLOSE_MINUTES_FIELD || null;
      // if (LOG_AUTOCLOSE_MINUTES_FIELD && autoCloseMinutes) fields[LOG_AUTOCLOSE_MINUTES_FIELD] = autoCloseMinutes;

      const created = await airtableCreate({
        pat: AIRTABLE_PAT,
        baseId: BASE_ID,
        table: LOGS_TABLE,
        fields,
      });

      return res.status(200).json({
        status: "shift_started",
        logRecordId: created.id,
        activityName,
        autoCloseMinutes: autoCloseMinutes ?? null,
      });
    }
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
};

/* -----------------------------
   Helpers
------------------------------ */

async function readJson(req) {
  // Vercel sometimes gives req.body already parsed
  if (req.body && typeof req.body === "object") return req.body;
  if (!req.body && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return {};
    return JSON.parse(raw);
  }
  if (typeof req.body === "string") return JSON.parse(req.body);
  return {};
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function airtableGet({ pat, baseId, table, recordId }) {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Airtable GET failed (${r.status}): ${text}`);
  return JSON.parse(text);
}

async function airtableList({ pat, baseId, table, filterByFormula, maxRecords = 50, sortField, sortDir = "asc" }) {
  const params = new URLSearchParams();
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  if (maxRecords) params.set("maxRecords", String(maxRecords));
  if (sortField) {
    params.set("sort[0][field]", sortField);
    params.set("sort[0][direction]", sortDir);
  }

  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Airtable LIST failed (${r.status}): ${text}`);
  return JSON.parse(text);
}

async function airtableCreate({ pat, baseId, table, fields }) {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Airtable CREATE failed (${r.status}): ${text}`);
  return JSON.parse(text);
}
