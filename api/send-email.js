export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Email API key not configured" });
  try {
    const { to, subject, html } = req.body;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "TruckPilot <support@truckpilot.ca>",
        to,
        subject,
        html,
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.message || "Failed to send" });
    res.status(200).json({ success: true, id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
