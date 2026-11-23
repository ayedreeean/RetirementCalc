// Writes the static guide and calculator pages. Run from the repo root:
//   node scripts/render-pages.mjs
// Cloudflare Pages serves the HTML this writes. It does not run this script.
import { readFileSync, writeFileSync } from 'node:fs';
import { CARDS, buildPages } from '../content/pages.mjs';
import {
    PLANS, SEED, money, runSavings, runRetirement, runPacks, sharePath, swrPlan,
    claimingBenefit, portfolioMix
} from '../content/scenarios.mjs';
import { CONSENT_TEXT } from '../functions/_lib/signup.js';

const DATE = '2026-11-23';
const OG = 'https://firecalc.ai/og-image.png';
const OG_ALT = 'FIREcalc: a savings path chart rising toward a dashed goal line, on a warm off-white background.';

const saveCache = new Map();
const retireCache = new Map();

function S(id) {
    if (!saveCache.has(id)) saveCache.set(id, runSavings(PLANS[id]));
    return saveCache.get(id);
}
function R(id) {
    if (!retireCache.has(id)) retireCache.set(id, runRetirement(PLANS[id]));
    return retireCache.get(id);
}
function swr(withdrawal, horizon, mode) {
    const key = `${withdrawal}:${horizon}:${mode}`;
    if (!retireCache.has(key)) retireCache.set(key, runRetirement(swrPlan(withdrawal, horizon, mode)));
    return retireCache.get(key);
}
function link(kind, id, extra) {
    let plan;
    if (id == null) plan = extra;
    else if (extra && typeof extra === 'object') plan = { ...PLANS[id], ...extra };
    else plan = PLANS[id];
    return sharePath(kind, plan);
}

const pages = buildPages({
    SEED, money, S, R, swr, swrPlan, link,
    packs: (id) => runPacks(PLANS[id]),
    mix: (year) => portfolioMix(year, 0.6),
    claim: claimingBenefit
});

function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function href(value) {
    return String(value).replace(/&/g, '&amp;');
}
function strip(value) {
    return String(value).replace(/<[^>]+>/g, '');
}

const BRAND = `<a class="brand" href="/" aria-label="FIREcalc home"><svg class="brand-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><defs><linearGradient id="brandSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBC77A"/><stop offset="1" stop-color="#EE8F3A"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="#0F7B6C"/><circle cx="16" cy="19.5" r="7.5" fill="url(#brandSun)"/><rect x="3" y="19.5" width="26" height="10" fill="#0F7B6C"/><path d="M5.5 24.5l5.5-2.8 4.6 1.8 5.6-5.4 5.3-2.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="brand-name">FIREcalc</span></a>`;

function jsonLd(page, faqs) {
    const url = `https://firecalc.ai${page.path}`;
    const crumbs = page.kind === 'hub'
        ? [
            { '@type': 'ListItem', position: 1, name: 'FIREcalc', item: 'https://firecalc.ai/' },
            { '@type': 'ListItem', position: 2, name: 'Guides', item: url }
        ]
        : page.kind === 'guide'
            ? [
                { '@type': 'ListItem', position: 1, name: 'FIREcalc', item: 'https://firecalc.ai/' },
                { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://firecalc.ai/guides' },
                { '@type': 'ListItem', position: 3, name: page.h1, item: url }
            ]
            : [
                { '@type': 'ListItem', position: 1, name: 'FIREcalc', item: 'https://firecalc.ai/' },
                { '@type': 'ListItem', position: 2, name: page.h1, item: url }
            ];
    const graph = [
        {
            '@type': page.kind === 'hub' ? 'CollectionPage' : 'WebPage',
            '@id': url,
            name: page.h1,
            url,
            description: page.description,
            isPartOf: { '@type': 'WebSite', name: 'FIREcalc', url: 'https://firecalc.ai/' }
        },
        {
            '@type': 'Article',
            headline: page.h1,
            description: page.description,
            datePublished: DATE,
            dateModified: DATE,
            author: { '@type': 'Organization', name: 'FIREcalc', url: 'https://firecalc.ai/' },
            publisher: { '@type': 'Organization', name: 'FIREcalc', url: 'https://firecalc.ai/' },
            image: OG,
            mainEntityOfPage: url
        },
        { '@type': 'BreadcrumbList', itemListElement: crumbs },
        {
            '@type': 'FAQPage',
            mainEntity: faqs.map(item => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: strip(item.a) }
            }))
        }
    ];
    if (page.kind === 'hub') {
        const items = page.groups.flatMap((group) => group[2]);
        graph.push({
            '@type': 'ItemList',
            itemListElement: items.map((id, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: CARDS[id][1],
                url: `https://firecalc.ai${CARDS[id][0]}`
            }))
        });
    }
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

function relatedNav(page) {
    if (!page.cards.length) return '';
    const items = page.cards.map(item => `<li><a class="guide-card" href="${item.href}"><strong>${esc(item.title)}</strong><span>${esc(item.blurb)}</span></a></li>`).join('');
    return `<nav class="guide-more" aria-label="More guides"><h2>Related guides</h2><ul class="guide-grid">${items}</ul><p><a href="/guides">All guides</a></p></nav>`;
}

function signup(page) {
    if (!page.source || !page.primary) return '';
    const plan = `https://firecalc.ai${page.primary}`;
    return `<form class="plan-signup" id="email-plan" data-signup action="/api/signup" method="post" data-source="${esc(page.source)}">
            <h2 id="signup-title">Email me my plan</h2>
            <p class="signup-note">Save the example plan linked above. A monthly re-check is why the list exists. Sending is not connected yet, so this only stores the signup. Open the calculator, change the numbers, and save again from the results if you want your own link instead.</p>
            <div class="signup-hp" aria-hidden="true"><label>Company website <input type="text" name="fc_website" tabindex="-1" autocomplete="off" value=""></label></div>
            <div class="signup-row">
                <label class="sr-only" for="email-${esc(page.source)}">Email</label>
                <input id="email-${esc(page.source)}" type="email" name="email" required maxlength="254" autocomplete="email" inputmode="email" placeholder="you@example.com">
                <button type="submit" class="btn btn-primary">Save my plan link</button>
            </div>
            <label class="signup-consent"><input type="checkbox" name="consent" value="yes" required><span>${esc(CONSENT_TEXT)}</span></label>
            <input type="hidden" name="source" value="${esc(page.source)}">
            <input type="hidden" name="plan_url" value="${href(plan)}">
            <input type="hidden" name="return_to" value="${esc(page.path)}">
            <p class="signup-status" role="status"></p>
            <p class="signup-fine">Delete it anytime on the <a href="/unsubscribe">unsubscribe page</a>. Details are in the <a href="/privacy-policy.html">privacy policy</a>.</p>
        </form>`;
}

function render(page) {
    const url = `https://firecalc.ai${page.path}`;
    const buttons = (page.links || []).map(item => `<a class="btn ${item.ghost ? 'btn-ghost' : 'btn-primary'}" href="${href(item.href)}">${esc(item.label)}</a>`).join('');
    const crumb = page.kind === 'hub'
        ? `<a href="/">FIREcalc</a> · <span aria-current="page">Guides</span>`
        : page.kind === 'guide'
            ? `<a href="/">FIREcalc</a> · <a href="/guides">Guides</a> · <span aria-current="page">${esc(page.crumb)}</span>`
            : `<a href="/">FIREcalc</a> · <a href="/guides">Guides</a> · <span aria-current="page">${esc(page.crumb)}</span>`;
    const faqs = page.faqs.map(item => ({ q: item.q, a: item.a }));
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${esc(page.title)}</title>
    <link rel="canonical" href="${url}">
    <link rel="describedby" href="/llms.txt" type="text/plain">
    <meta name="description" content="${esc(page.description)}">
    <meta property="og:title" content="${esc(page.title)}">
    <meta property="og:description" content="${esc(page.description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="FIREcalc">
    <meta property="og:image" content="${OG}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(OG_ALT)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${OG}">
    <meta name="twitter:title" content="${esc(page.title)}">
    <meta name="twitter:description" content="${esc(page.description)}">
    <meta name="theme-color" content="#FAF8F4">
    <script type="application/ld+json">
    ${jsonLd(page, faqs)}
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-57CCGCXNJT"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-57CCGCXNJT');
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..650&family=Inter:wght@400..700&display=swap" rel="stylesheet">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/icon-192x192.png">
    <link rel="manifest" href="/manifest.json">
    <link rel="stylesheet" href="/styles.css?v=15">
</head>
<body class="hub-page">
    <a href="#main" class="skip-to-content">Skip to content</a>
    <div class="sky" aria-hidden="true"></div>
    <header class="app-header" role="banner">
        <div class="header-inner">
            ${BRAND}
            <nav class="tabs" aria-label="Site">
                <a class="tab" href="/">Calculator</a>
                <a class="tab" href="/guides"${page.kind === 'hub' ? ' aria-current="page"' : ''}>Guides</a>
                <a class="tab" href="/ai"><span class="lbl-long">Agent &amp; plugins</span><span class="lbl-short">Agents</span></a>
            </nav>
            <div class="header-actions"><a class="header-link" href="/llms-full.txt">Methodology</a></div>
        </div>
    </header>
    <main id="main" class="hub guide" tabindex="-1">
        <nav class="crumbs" aria-label="Breadcrumb">${crumb}</nav>
        <div class="intro">
            <p class="eyebrow"><span class="eyebrow-dot"></span>${esc(page.eyebrow)}</p>
            <h1 class="display">${esc(page.h1)}</h1>
            <p class="lede">${page.lede}</p>
            <div class="hero-actions">${buttons}</div>
            <p class="hero-hint">${page.hint}</p>
        </div>
        <dl class="honesty" aria-label="Sample and method">
            <div><dt>Sample</dt><dd>1975–2024, 50 years</dd></div>
            <div><dt>Assets</dt><dd>S&amp;P 500 and 10-yr Treasuries</dd></div>
            <div><dt>Not in the sample</dt><dd>1966 and 1973–74</dd></div>
            <div><dt>Framing</dt><dd>An illustration, not advice</dd></div>
            <a class="honesty-link" href="/llms-full.txt">Methodology</a>
        </dl>
        <div class="${page.kind === 'hub' ? 'guide-prose guide-prose-wide' : 'guide-prose'}">
            ${page.body}
            ${faqs.map(item => `<h3>${esc(item.q)}</h3><p>${item.a}</p>`).join('')}
        </div>
        ${signup(page)}
        ${relatedNav(page)}
        <footer class="hub-footer"><nav aria-label="Footer"><a href="/">Calculator</a><a href="/guides">Guides</a><a href="/ai">Agent &amp; plugins</a><a href="/llms-full.txt">Methodology</a><a href="/privacy-policy.html">Privacy</a><a href="/unsubscribe">Unsubscribe</a></nav><p>FIREcalc is a planning sketch, not financial advice. Calculations run in your browser. A share link you choose to email is stored only if you opt in.</p></footer>
    </main>
    <script defer src="/signup.js?v=1"></script>
</body>
</html>
`;
}

function itemListFix(page, html) {
    return html;
}

const sitemapExtras = [
    ['https://firecalc.ai/', DATE, 'monthly', '1.0'],
    ['https://firecalc.ai/privacy-policy.html', '2026-10-01', 'yearly', '0.3'],
    ['https://firecalc.ai/ai', DATE, 'monthly', '0.6'],
    ['https://firecalc.ai/guides/when-can-i-retire', DATE, 'monthly', '0.8'],
    ['https://firecalc.ai/guides/retire-on-one-million', DATE, 'monthly', '0.8'],
    ['https://firecalc.ai/guides/fire-calculator-for-families', DATE, 'monthly', '0.8'],
    ['https://firecalc.ai/guides/coast-fire', DATE, 'monthly', '0.8'],
    ['https://firecalc.ai/guides/four-percent-rule', DATE, 'monthly', '0.8']
];

let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const [loc, lastmod, freq, priority] of sitemapExtras) {
    sitemap += `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}
const ordered = [...pages].sort((a, b) => a.path.localeCompare(b.path));
for (const page of ordered) {
    const priority = page.kind === 'hub' ? '0.9' : page.kind === 'landing' ? '0.9' : '0.8';
    sitemap += `  <url>\n    <loc>https://firecalc.ai${page.path}</loc>\n    <lastmod>${DATE}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}
sitemap += `</urlset>\n`;

for (const page of pages) {
    let html = render(page);
    html = itemListFix(page, html);
    html = html.replace(/href="([^"]*)"/g, (match, url) => `href="${url.replace(/&amp;/g, '&').replace(/&/g, '&amp;')}"`);
    writeFileSync(page.file, html);
    console.log(page.path, '->', page.file);
}
writeFileSync('sitemap.xml', sitemap);
console.log('wrote', pages.length, 'pages');

const legacyExtras = {
    'guides/when-can-i-retire.html': [
        ['/guides/retire-at-40', 'Retire at 40', 'A 50-year horizon, and one historical window.'],
        ['/guides/fire-number', 'FIRE number', 'Spending divided by the rate you will test.']
    ],
    'guides/retire-on-one-million.html': [
        ['/guides/fire-number', 'FIRE number', 'How 25× spending becomes a portfolio to test.'],
        ['/guides/fat-fire', 'Fat FIRE', 'The same test at a high budget.']
    ],
    'guides/fire-calculator-for-families.html': [
        ['/guides/retiring-early-with-kids', 'Retiring early with kids', 'College and health premiums inside one spending number.'],
        ['/guides/social-security-early-retirement', 'Social Security', 'A long gap before the first check.']
    ],
    'guides/coast-fire.html': [
        ['/coast-fire-calculator', 'Coast FIRE calculator', 'The zero-contribution example, opened directly.'],
        ['/guides/barista-fire', 'Barista FIRE', 'Part-time pay after you have started spending.']
    ],
    'guides/four-percent-rule.html': [
        ['/guides/safe-withdrawal-rate', '3.5% and 3.25%', 'The same portfolio at four withdrawal rates.'],
        ['/guides/sequence-of-returns', 'Sequence of returns', 'Why the start year changes the ending balance.']
    ]
};

for (const [file, extras] of Object.entries(legacyExtras)) {
    let html = readFileSync(file, 'utf8');
    html = html.replace('Email me my FIRE plan', 'Email me my plan');
    html = html.replace(
        '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">FIREcalc</a> · <span',
        '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">FIREcalc</a> · <a href="/guides">Guides</a> · <span'
    );
    if (!html.includes('href="/guides">Guides</a>')) {
        html = html.replace(
            '<a class="tab" href="/">Calculator</a>',
            '<a class="tab" href="/">Calculator</a>\n                <a class="tab" href="/guides">Guides</a>'
        );
    }
    if (!html.includes('<footer class="hub-footer"><nav aria-label="Footer"><a href="/">Calculator</a><a href="/guides">Guides</a>')) {
        html = html.replace(
            '<footer class="hub-footer"><nav aria-label="Footer"><a href="/">Calculator</a>',
            '<footer class="hub-footer"><nav aria-label="Footer"><a href="/">Calculator</a><a href="/guides">Guides</a>'
        );
    }
    const block = JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1]);
    const crumbs = block['@graph'].find(node => node['@type'] === 'BreadcrumbList');
    if (!crumbs.itemListElement.some(item => item.name === 'Guides')) {
        const pageItem = crumbs.itemListElement[crumbs.itemListElement.length - 1];
        crumbs.itemListElement = [
            crumbs.itemListElement[0],
            { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://firecalc.ai/guides' },
            { ...pageItem, position: 3 }
        ];
    }
    const web = block['@graph'].find(node => node['@type'] === 'WebPage');
    if (!block['@graph'].some(node => node['@type'] === 'Article')) {
        block['@graph'].splice(1, 0, {
            '@type': 'Article',
            headline: web.name,
            description: web.description,
            datePublished: '2026-10-26',
            dateModified: DATE,
            author: { '@type': 'Organization', name: 'FIREcalc', url: 'https://firecalc.ai/' },
            publisher: { '@type': 'Organization', name: 'FIREcalc', url: 'https://firecalc.ai/' },
            image: OG,
            mainEntityOfPage: web.url
        });
    }
    const json = JSON.stringify(block).replace(/</g, '\\u003c');
    html = html.replace(/<script type="application\/ld\+json">\s*[\s\S]*?<\/script>/, `<script type="application/ld+json">\n    ${json}\n    </script>`);
    if (file.endsWith('coast-fire.html') && !html.includes('href="/guides/barista-fire">Barista FIRE')) {
        html = html.replace('Barista FIRE, a sabbatical', '<a href="/guides/barista-fire">Barista FIRE</a>, a sabbatical');
    }
    if (file.endsWith('four-percent-rule.html') && !html.includes('withdrawal-rate guide')) {
        html = html.replace(
            '<h2>Questions people ask next</h2>',
            '<p>A longer early retirement is a different test. The <a href="/guides/safe-withdrawal-rate">withdrawal-rate guide</a> compares 4%, 3.5%, 3.25%, and 3% on one portfolio. The <a href="/guides/sequence-of-returns">sequence page</a> shows how the start year moves the ending balance even when every window survives. The <a href="/guides/market-crash-at-retirement">crash page</a> replays 2000, 2008, and 2022.</p><h2>Questions people ask next</h2>'
        );
    }
    if (file.endsWith('fire-calculator-for-families.html') && !html.includes('retiring-with-kids guide')) {
        html = html.replace(
            '<h2>Questions people ask next</h2>',
            '<p>College bills and health premiums are still one spending number. The <a href="/guides/retiring-early-with-kids">retiring-with-kids guide</a> says what a 529 and an insurance premium can and cannot be in this tool. <a href="/guides/social-security-early-retirement">Social Security</a> is off unless you turn it on.</p><h2>Questions people ask next</h2>'
        );
    }
    for (const [path, title, blurb] of extras) {
        if (!html.includes(`href="${path}"`)) {
            html = html.replace('</ul></nav>', `<li><a class="guide-card" href="${path}"><strong>${title}</strong><span>${blurb}</span></a></li></ul></nav>`);
        }
    }
    if (!html.includes('>All guides<')) {
        html = html.replace('</ul></nav>', '</ul><p><a href="/guides">All guides</a></p></nav>');
    }
    writeFileSync(file, html);
    console.log('patched', file);
}
