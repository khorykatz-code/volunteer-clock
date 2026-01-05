import { CFG, airtableUrl, airtableFetch } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;

    const url = new URL(airtableUrl(baseId, CFG.ACTIVITIES_TABLE));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("sort[0][field]", CFG.ACTIVITY_NAME_FIELD);
    url.searchParams.set("sort[0][direction]", "asc");

    const data = await airtableFetch(url.toString());

    const activities = (data.records || []).map(r => ({
      id: r.id,
      name: r.fields?.[CFG.ACTIVITY_NAME_FIELD] ?? null,
      mode: r.fields?.[CFG.ACTIVITY_MODE_FIELD] ?? null,
      autoCloseMinutes: r.fields?.[CFG.ACTIVITY_AUTOCLOSE_MIN_FIELD] ?? null
    }));

    res.status(200).json({ activities });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch activities", detail: String(e) });
  }
}
