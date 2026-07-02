// Vercel serverless function — verifies login against environment variables.
// Set APP_USERNAME and APP_PASSWORD in Vercel > Settings > Environment Variables.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { username, password } = req.body || {};
  const ok =
    username === process.env.APP_USERNAME &&
    password === process.env.APP_PASSWORD &&
    !!process.env.APP_USERNAME &&
    !!process.env.APP_PASSWORD;

  if (ok) return res.status(200).json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Invalid credentials' });
}
