// Link-only FIREcalc MCP over streamable HTTP (stateless JSON responses).
//
// Privacy: do not log request bodies, tool arguments, query strings, or dollar
// amounts. The audit line is route, JSON-RPC method, tool name, and status.
// This worker does not store plan inputs and does not run FirecalcSim.
import { InputError, callHostedTool, listHostedTools } from './tools.js';

const PROTOCOL = '2025-03-26';
const MAX_BODY = 64 * 1024;
const SERVER_INFO = { name: 'firecalc-link', title: 'FIREcalc', version: '0.1.0' };
const INSTRUCTIONS = 'FIREcalc link-only MCP. Build https://firecalc.ai share and challenge URLs. Do not invent a portfolio, a withdrawal, income, spending, a savings goal, or a Social Security benefit. Do not report a success rate: this server does not run trials. The sample is US large-cap stocks and 10-year Treasuries, 1975–2024. Illustration, not advice. The person opens the link in a browser to see the plan.';

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
    'access-control-expose-headers': 'Mcp-Session-Id, MCP-Protocol-Version',
    'access-control-max-age': '86400'
};

function defaultLog(event) {
    const line = {
        service: 'firecalc-link-mcp',
        route: event.route || null,
        rpc: event.rpc || null,
        tool: event.tool || null,
        status: event.status,
        errorCode: event.errorCode == null ? null : event.errorCode
    };
    console.log(JSON.stringify(line));
}

function safeToolName(name) {
    if (typeof name !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(name)) return null;
    return name;
}

function withCors(headers) {
    return { ...CORS, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers };
}

function empty(status, extra) {
    return new Response(null, { status, headers: withCors(extra || {}) });
}

function json(body, status, extra) {
    return new Response(JSON.stringify(body), {
        status,
        headers: withCors({ 'content-type': 'application/json; charset=utf-8', ...(extra || {}) })
    });
}

function wantsJson(request) {
    const accept = request.headers.get('accept') || '';
    if (!accept || accept.includes('application/json') || accept.includes('*/*')) return true;
    return !accept.includes('text/event-stream');
}

function respond(request, payload, status) {
    if (wantsJson(request)) return json(payload, status);
    const sse = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
    return new Response(sse, {
        status,
        headers: withCors({ 'content-type': 'text/event-stream; charset=utf-8' })
    });
}

function rpcError(id, code, message, status) {
    return { payload: { jsonrpc: '2.0', id: id == null ? null : id, error: { code, message } }, status };
}

function toolResult(value) {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        structuredContent: value
    };
}

function toolError(message) {
    return { content: [{ type: 'text', text: message }], isError: true };
}

function isOAuthPath(pathname) {
    return pathname.includes('oauth')
        || pathname.includes('openid-configuration')
        || pathname === '/authorize'
        || pathname === '/token'
        || pathname === '/register'
        || pathname.endsWith('/authorize')
        || pathname.endsWith('/token')
        || pathname.endsWith('/register');
}

function handleRpc(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message !== 'object' || Array.isArray(message)) {
        return rpcError(null, -32600, 'Invalid Request', 400);
    }
    const { id, method, params } = message;
    if (id == null) {
        if (typeof method === 'string' && method.startsWith('notifications/')) return { notification: true };
        return rpcError(null, -32600, 'Invalid Request', 400);
    }
    if (method === 'initialize') {
        const requested = params && params.protocolVersion;
        const protocolVersion = typeof requested === 'string' && /^202\d-\d{2}-\d{2}$/.test(requested) ? requested : PROTOCOL;
        return {
            status: 200,
            payload: {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: SERVER_INFO,
                    instructions: INSTRUCTIONS
                }
            }
        };
    }
    if (method === 'ping') return { status: 200, payload: { jsonrpc: '2.0', id, result: {} } };
    if (method === 'tools/list') return { status: 200, payload: { jsonrpc: '2.0', id, result: { tools: listHostedTools() } } };
    if (method === 'tools/call') {
        const name = params && params.name;
        const args = params && params.arguments != null ? params.arguments : {};
        if (typeof name !== 'string') return rpcError(id, -32602, 'tools/call requires a tool name.', 200);
        try {
            return { status: 200, payload: { jsonrpc: '2.0', id, result: toolResult(callHostedTool(name, args)) } };
        } catch (error) {
            if (error instanceof InputError) {
                return { status: 200, payload: { jsonrpc: '2.0', id, result: toolError(error.message) } };
            }
            return { status: 200, payload: { jsonrpc: '2.0', id, result: toolError('The link builder failed before it wrote a URL. No plan was calculated.') } };
        }
    }
    if (method === 'resources/list') return { status: 200, payload: { jsonrpc: '2.0', id, result: { resources: [] } } };
    if (method === 'prompts/list') return { status: 200, payload: { jsonrpc: '2.0', id, result: { prompts: [] } } };
    return rpcError(id, -32601, `Method not found: ${method}`, 200);
}

async function handleMcp(request, log) {
    if (request.method === 'OPTIONS') return empty(204);
    if (request.method === 'DELETE') {
        log({ route: '/mcp', status: 204 });
        return empty(204);
    }
    if (request.method === 'GET') {
        log({ route: '/mcp', status: 405 });
        return json(
            { error: 'Stateless MCP. POST JSON-RPC here. This server does not open an SSE session and does not calculate.' },
            405,
            { allow: 'POST, DELETE, OPTIONS' }
        );
    }
    if (request.method !== 'POST') {
        log({ route: '/mcp', status: 405 });
        return json({ error: 'Method not allowed' }, 405, { allow: 'POST, DELETE, OPTIONS' });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) {
        log({ route: '/mcp', status: 413, errorCode: -32600 });
        return respond(request, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request body is too large.' } }, 413);
    }
    let message;
    try {
        message = raw ? JSON.parse(raw) : null;
    } catch {
        log({ route: '/mcp', status: 400, errorCode: -32700 });
        return respond(request, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    }
    if (Array.isArray(message)) {
        log({ route: '/mcp', status: 400, errorCode: -32600 });
        return respond(request, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'JSON-RPC batches are not supported.' } }, 400);
    }

    const rpc = message && typeof message.method === 'string' ? message.method : null;
    const tool = rpc === 'tools/call' ? safeToolName(message.params && message.params.name) : null;
    const outcome = handleRpc(message);
    if (outcome.notification) {
        log({ route: '/mcp', rpc, status: 202 });
        return empty(202);
    }
    log({ route: '/mcp', rpc, tool, status: outcome.status, errorCode: outcome.payload.error ? outcome.payload.error.code : null });
    return respond(request, outcome.payload, outcome.status);
}

export function createFetch({ log = defaultLog } = {}) {
    return async function fetch(request) {
        const url = new URL(request.url);
        if (request.method === 'OPTIONS') return empty(204);
        if (isOAuthPath(url.pathname)) {
            log({ route: url.pathname, status: 404 });
            return json({
                error: 'oauth_not_used',
                message: 'This link-only MCP does not use OAuth. Add the connector with no authentication.'
            }, 404);
        }
        if (url.pathname === '/' && request.method === 'GET') {
            log({ route: '/', status: 200 });
            return json({
                ok: true,
                name: 'FIREcalc link MCP',
                mode: 'link-only',
                compute: false,
                mcp: '/mcp',
                privacy: 'Request bodies and tool arguments are not logged. This worker does not run simulations or store plan inputs.'
            }, 200);
        }
        if (url.pathname === '/mcp') return handleMcp(request, log);
        log({ route: url.pathname, status: 404 });
        return json({ error: 'Not found', compute: false }, 404);
    };
}

export default { fetch: createFetch() };
