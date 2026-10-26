// Render both emails for one saved plan. Writes HTML and text. Does not send.
import { mkdirSync, writeFileSync } from 'node:fs';
import { previewOne } from './campaign.js';
import { APPROVED_POSTAL, QUESTIONS_EMAIL } from './schedule.js';

const planUrl = process.env.PLAN_URL
    || 'https://firecalc.ai/?tab=accumulation&currentAge=42&currentSavings=350000&income=120000&expenses=60000&targetAmount=1500000&stockAllocation=70&incomeGrowth=2&savingsSimulationCount=1000&savingsReturnMode=shuffled&seed=246813';
const year = Number(process.env.YEAR || 2027);
const out = process.env.OUT_DIR || '/tmp/firecalc-mail-preview';
const postal = process.env.POSTAL_ADDRESS || process.env.MAIL_POSTAL_ADDRESS || APPROVED_POSTAL;
const replyTo = process.env.MAIL_REPLY_TO || QUESTIONS_EMAIL;
mkdirSync(out, { recursive: true });

for (const kind of ['quarterly', 'january']) {
    const built = previewOne({ planUrl, kind, year, postal, replyTo });
    if (!built.ok) {
        console.error(JSON.stringify({ kind, error: built.detail }));
        process.exit(1);
    }
    const htmlPath = `${out}/${kind}.html`;
    const textPath = `${out}/${kind}.txt`;
    writeFileSync(htmlPath, built.message.html);
    writeFileSync(textPath, built.message.text);
    console.log(JSON.stringify({
        kind,
        subject: built.message.subject,
        sendable: built.message.sendable !== false,
        status: built.status,
        html: htmlPath,
        text: textPath
    }));
}
