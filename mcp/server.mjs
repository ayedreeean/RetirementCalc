#!/usr/bin/env node
// Local-only FIREcalc MCP server. Speaks newline-delimited JSON-RPC on stdio.
// It does not listen on a port, and it does not send calculator inputs anywhere.
import { resolve } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { callTool, InputError, listResources, listTools, readResource } from './handlers.mjs';

const PROTOCOL = '2025-03-26';
const SERVER_INFO = { name: 'firecalc', version: '0.1.0' };

function send(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
    send({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } });
}

function toolResult(value) {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        structuredContent: value
    };
}

function toolError(message) {
    return {
        content: [{ type: 'text', text: message }],
        isError: true
    };
}

function onMessage(message) {
    if (!message || message.jsonrpc !== '2.0') return;
    const { id, method, params } = message;
    if (id == null) return;

    if (method === 'initialize') {
        const requested = params && params.protocolVersion;
        reply(id, {
            protocolVersion: typeof requested === 'string' && /^202\d-\d{2}-\d{2}$/.test(requested) ? requested : PROTOCOL,
            capabilities: {
                tools: { listChanged: false },
                resources: { listChanged: false }
            },
            serverInfo: SERVER_INFO,
            instructions: 'FIREcalc runs locally in this process. Do not send the numbers to a server. There is no public compute API. The sample is US large-cap stocks and 10-year Treasuries, 1975–2024. Social Security is off unless the caller turns it on. This is an illustration, not advice. Hand back firecalc_url so the person can open the same plan in the browser.'
        });
        return;
    }
    if (method === 'ping') {
        reply(id, {});
        return;
    }
    if (method === 'tools/list') {
        reply(id, { tools: listTools() });
        return;
    }
    if (method === 'tools/call') {
        const name = params && params.name;
        const args = params && params.arguments ? params.arguments : {};
        if (typeof name !== 'string') {
            fail(id, -32602, 'tools/call requires a tool name.');
            return;
        }
        try {
            reply(id, toolResult(callTool(name, args)));
        } catch (error) {
            if (error instanceof InputError) {
                reply(id, toolError(error.message));
                return;
            }
            process.stderr.write(`firecalc-mcp: tool failed: ${error && error.stack ? error.stack : error}\n`);
            reply(id, toolError('The local calculator failed before finishing. No result was produced.'));
        }
        return;
    }
    if (method === 'resources/list') {
        reply(id, { resources: listResources() });
        return;
    }
    if (method === 'resources/read') {
        const uri = params && params.uri;
        try {
            reply(id, { contents: [readResource(uri)] });
        } catch (error) {
            if (error instanceof InputError) {
                fail(id, -32002, error.message);
                return;
            }
            fail(id, -32603, 'Could not read that resource.');
        }
        return;
    }
    if (method === 'prompts/list') {
        reply(id, { prompts: [] });
        return;
    }
    fail(id, -32601, `Method not found: ${method}`);
}

function main() {
    process.stderr.write('firecalc-mcp: stdio ready (local only, no network)\n');
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', line => {
        const text = line.trim();
        if (!text) return;
        let message;
        try {
            message = JSON.parse(text);
        } catch {
            fail(null, -32700, 'Parse error');
            return;
        }
        try {
            onMessage(message);
        } catch (error) {
            process.stderr.write(`firecalc-mcp: ${error && error.stack ? error.stack : error}\n`);
            if (message && message.id != null) fail(message.id, -32603, 'Internal error');
        }
    });
    rl.on('close', () => process.exit(0));
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked && invoked === fileURLToPath(import.meta.url)) main();
