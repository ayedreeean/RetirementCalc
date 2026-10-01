// Test-only guard. Imported by the smoke test so a server that opens a socket fails.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

function ban(name) {
    return () => {
        throw new Error(`network forbidden: ${name}`);
    };
}

net.createServer = ban('net.createServer');
http.createServer = ban('http.createServer');
http.request = ban('http.request');
http.get = ban('http.get');
https.createServer = ban('https.createServer');
https.request = ban('https.request');
https.get = ban('https.get');
dns.lookup = ban('dns.lookup');
if (dns.promises) dns.promises.lookup = ban('dns.promises.lookup');
globalThis.fetch = ban('fetch');
