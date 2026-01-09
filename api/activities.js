// api/activities.js
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const cfg = require("./_config");

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY;
    const BASE_ID = cfg.BASE_ID || process.env.AIRTABLE_BASE_ID;
    const ACTIVITIES_TABLE = cfg.ACTIVITIES_TABLE || "Work Hour Events and Categories";

    // Activity fields (defaults match your Airtable names)
    const ACT_NAME_FIELD = cfg.ACT_NAME_FIELD || "Name";
    const ACT_MODE_FIELD = cfg.ACT_MODE_FIELD || "Mode";
    const ACT_ACTIVE_FIELD = cfg.ACT_ACTIVE_FIELD || "Active?";
    const ACT_MAX_MINUTES_FIELD = cfg.ACT_MAX_MINUTES_FIELD || "MaxMinutes"; // Attendance fixed length
    const ACT_AUTOCLOSE_FIELD = cfg.ACT_AUTOCLOSE_FIELD || "AutoCloseMaxMinutes"; // Shift autoclose duration

    if (!AIRTABLE_PAT) {
      return res.status(500).json({ error: "Missing AIRTABLE_PAT env var" });
    }
    if (!BASE_ID) {
      return res.status(500).json({ error: "Missing BASE_ID (set in _config.js or AIRTABLE_BASE_ID)" });
    }

    // Only active activities
    const filter = `AND({${ACT_ACTIVE_FIELD}}=TRUE())`;

    const url =
      `https://api.airtable.com/v0/${encodeURIComponent(BASE_ID)}/${encodeURIComponent(ACTIVITIES_TABLE)}` +
      `?filterByFormula=${encodeURIComponent(filter)}` +
      `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(ACT_NAME_FIELD)}` +
      `&sort%5B0%5D%5Bdirection%5D=asc`;

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        "Content-Type": "application/json",
      },
    });

    const bodyText = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({
        error: "Failed to fetch activities",
        detail: bodyText,
      });
    }

    const data = JSON.parse(bodyText);
    const activities = (data.records || []).map((rec) => {
      const f = rec.fields || {};
      return {
        id: rec.id,
        name: f[ACT_NAME_FIELD] ?? null,
        mode: f[ACT_MODE_FIELD] ?? null,
        active: !!f[ACT_ACTIVE_FIELD],
        maxMinutes: f[ACT_MAX_MINUTES_FIELD] ?? null,          // ✅ Attendance duration
        autoCloseMinutes: f[ACT_AUTOCLOSE_FIELD] ?? null,       // ✅ Shift autoclose duration
      };
    });

    return res.status(200).json({ activities });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
};
