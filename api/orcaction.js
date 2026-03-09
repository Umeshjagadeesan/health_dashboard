/**
 * Vercel Serverless Function: /api/orcaction
 *
 * Proxies start/stop commands to the CloudPort Orchestration API
 * and sends email notification via Gmail SMTP.
 *
 * POST /api/orcaction
 * Body: { action: "start"|"stop", feedCode: "...", playerId: "001" }
 */
import https from 'https';
import nodemailer from 'nodemailer';

const ORC_BASE = 'https://aws-use1-psync-cp-orchestrator.demo.amagi.tv';
const BLIP_EMAIL = process.env.BLIP_EMAIL || 'umesh.j@amagi.com';
const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'se.india@amagi.com';
const MAIL_USER = process.env.MAIL_USERNAME || 'india_se@amagi.com';
const MAIL_PASS = process.env.MAIL_PASSWORD || 'xzxz ppoq vjhd cahn';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: MAIL_USER, pass: MAIL_PASS },
});

function forwardToOrchestrator(feedCode, playerId, action) {
  const url = `${ORC_BASE}/pocs/api/v1/feeds/${feedCode}/players/${playerId}/action`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(JSON.stringify({ command: action }));
    req.end();
  });
}

async function sendEmail(action, feedCode, playerId, httpStatus) {
  const verb = action === 'start' ? 'Started' : 'Stopped';
  const subject = `Player ${verb} in pocs.demo.amagi.tv`;
  const text = [
    `Player action: ${action.toUpperCase()}`,
    `Feed code:     ${feedCode}`,
    `Player ID:     ${playerId}`,
    `HTTP status:   ${httpStatus}`,
    `Triggered by:  ${BLIP_EMAIL}`,
    `Time:          ${new Date().toISOString()}`,
    '',
    `Orchestrator: ${ORC_BASE}/pocs/api/v1/feeds/${feedCode}/players/${playerId}`,
  ].join('\n');

  await transporter.sendMail({
    from: `"Health Dashboard" <${MAIL_USER}>`,
    to: NOTIFY_TO,
    subject,
    text,
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, feedCode, playerId } = req.body || {};

  if (!action || !feedCode || !playerId) {
    return res.status(400).json({ error: 'Missing action, feedCode, or playerId' });
  }
  if (!['start', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'action must be "start" or "stop"' });
  }

  try {
    // 1. Forward to orchestrator
    const orcResult = await forwardToOrchestrator(feedCode, playerId, action);

    let orcData;
    try { orcData = JSON.parse(orcResult.body); } catch { orcData = { raw: orcResult.body }; }

    // 2. Send email (fire-and-forget)
    sendEmail(action, feedCode, playerId, orcResult.statusCode).catch(err => {
      console.error('[OrcAction] Email failed:', err.message);
    });

    return res.status(orcResult.statusCode).json(orcData);
  } catch (err) {
    console.error('[OrcAction] Error:', err);
    return res.status(502).json({ error: err.message });
  }
}
