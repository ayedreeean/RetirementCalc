import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

function startServer() {
    const preload = fileURLToPath(new URL('./no-net-preload.mjs', import.meta.url));
    const server = fileURLToPath(new URL('./server.mjs', import.meta.url));
    const child = spawn(process.execPath, ['--import', preload, server], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    let buf = '';
    const queue = [];
    const waiters = [];
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line);
            if (waiters.length) waiters.shift()(msg);
            else queue.push(msg);
        }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    function request(id, method, params) {
        const pending = new Promise(resolve => {
            if (queue.length) resolve(queue.shift());
            else waiters.push(resolve);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        return pending;
    }
    function notify(method) {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    }
    return { child, request, notify, stderr: () => stderr };
}

test('MCP server starts on stdio and answers a tool call without the network', async () => {
    const server = startServer();
    try {
        const init = await server.request(1, 'initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'smoke', version: '0' }
        });
        assert.equal(init.id, 1);
        assert.equal(init.result.serverInfo.name, 'firecalc');
        assert.equal(init.result.protocolVersion, '2025-03-26');
        assert.match(init.result.instructions, /local/i);
        server.notify('notifications/initialized');

        const listed = await server.request(2, 'tools/list');
        const names = listed.result.tools.map(tool => tool.name).sort();
        assert.deepEqual(names, [
            'build_firecalc_link',
            'describe_methodology',
            'retirement_success',
            'run_stress_pack',
            'years_to_target'
        ]);
        for (const tool of listed.result.tools) {
            assert.equal(tool.annotations.openWorldHint, false);
        }

        const described = await server.request(3, 'tools/call', { name: 'describe_methodology', arguments: {} });
        const methodology = JSON.parse(described.result.content[0].text);
        assert.equal(methodology.assumptions.hostedCompute, false);
        assert.equal(methodology.firecalc_url, 'https://firecalc.ai/llms-full.txt');
        assert.equal(described.result.isError, undefined);

        const packed = await server.request(4, 'tools/call', {
            name: 'run_stress_pack',
            arguments: {
                pack: 'gfc',
                retirementSavings: 1000000,
                annualWithdrawal: 40000,
                taxRatePercent: 0,
                horizonYears: 20
            }
        });
        const pack = JSON.parse(packed.result.content[0].text);
        assert.equal(pack.card.packId, 'gfc');
        assert.equal(pack.modeUsed, 'historical');
        assert.equal(pack.scenarioCount, 1);
        assert.match(pack.firecalc_url, /pack=gfc/);
        assert.doesNotMatch(pack.shareCardSvg, /\$|1000000/);

        const bad = await server.request(5, 'tools/call', {
            name: 'run_stress_pack',
            arguments: { pack: 'not-a-pack', retirementSavings: 1, annualWithdrawal: 1 }
        });
        assert.equal(bad.result.isError, true);
        assert.match(bad.result.content[0].text, /Unknown stress pack/);

        const resource = await server.request(6, 'resources/read', { uri: 'firecalc://methodology' });
        assert.match(resource.result.contents[0].text, /1975–2024/);

        assert.match(server.stderr(), /stdio ready \(local only, no network\)/);
        assert.doesNotMatch(server.stderr(), /network forbidden/);
    } finally {
        server.child.kill();
        await new Promise(resolve => server.child.once('close', resolve));
    }
});
