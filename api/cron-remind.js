export default async function handler(req, res) {
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // existing logic continues here
