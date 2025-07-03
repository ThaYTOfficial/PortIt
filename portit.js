#!/usr/bin/env node

const WebSocket = require('ws');
const net = require('net');
const fs = require('fs');
const path = require('path');

const VPS_IP = '5.254.6.149';
const WS_PORT = 7000;
const FORWARDS_FILE = path.join(require('os').homedir(), '.portit-forwards.json');

function usage() {
  console.log('Usage: portit add <local-port> | remove <public-port> | list');
  process.exit(1);
}

function loadForwards() {
  try {
    return JSON.parse(fs.readFileSync(FORWARDS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveForwards(forwards) {
  fs.writeFileSync(FORWARDS_FILE, JSON.stringify(forwards, null, 2));
}

const cmd = process.argv[2];

if (!['add', 'remove', 'list'].includes(cmd)) usage();

if (cmd === 'list') {
  const forwards = loadForwards();
  if (forwards.length === 0) {
    console.log('No active forwards.');
  } else {
    forwards.forEach(f => {
      console.log(`Local: ${f.localPort} -> ${f.vpsIp}:${f.publicPort}`);
    });
  }
  process.exit(0);
}

if (cmd === 'remove') {
  if (process.argv.length !== 4) usage();
  const publicPort = parseInt(process.argv[3], 10);
  if (isNaN(publicPort) || publicPort < 1 || publicPort > 65535) usage();
  // Remove from forwards file
  let forwards = loadForwards();
  const idx = forwards.findIndex(f => f.publicPort === publicPort);
  if (idx === -1) {
    console.log('No such forward.');
    process.exit(1);
  }
  forwards.splice(idx, 1);
  saveForwards(forwards);
  // Notify server (best effort)
  const ws = new WebSocket(`ws://${VPS_IP}:${WS_PORT}`);
  ws.on('open', () => {
    ws.send(JSON.stringify({ action: 'remove', publicPort }));
    ws.close();
    console.log(`Forward for port ${publicPort} removed.`);
  });
  ws.on('error', () => {
    console.log('Forward removed locally, but could not contact server.');
  });
  return;
}

// ADD command
if (process.argv.length !== 4) usage();
const localPort = parseInt(process.argv[3], 10);
if (isNaN(localPort) || localPort < 1 || localPort > 65535) usage();

const ws = new WebSocket(`ws://${VPS_IP}:${WS_PORT}`);

ws.on('open', () => {
  ws.send(JSON.stringify({ action: 'add', localPort }));
});

let forwardInfo = null;

ws.on('message', (msg) => {
  let data;
  try {
    data = JSON.parse(msg);
  } catch (e) {
    return;
  }
  if (data.action === 'added') {
    forwardInfo = { localPort, publicPort: data.publicPort, vpsIp: data.vpsIp };
    // Save to forwards file
    let forwards = loadForwards();
    forwards.push(forwardInfo);
    saveForwards(forwards);
    console.log(`Your port is now forwarded to ${data.vpsIp}:${data.publicPort}`);
  } else if (data.action === 'incoming') {
    // Incoming connection from the server, set up a TCP connection to localPort
    const localSocket = net.connect(localPort, '127.0.0.1');
    localSocket.on('data', (chunk) => ws.send(chunk));
    ws.on('message', (clientMsg) => {
      if (typeof clientMsg !== 'string') localSocket.write(clientMsg);
    });
    localSocket.on('close', () => ws.send(JSON.stringify({ action: 'local_closed' })));
  } else if (data.error) {
    console.error('Error:', data.error);
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
}); 