import { serve } from "bun";
import { WebSocketServer } from "ws";
import net from "net";

const VPS_IP = "127.0.0.1"; // Change to your public IP in production
const WS_PORT = 7000; // Port for WebSocket control connections
const MIN_PORT = 20000;
const MAX_PORT = 30000;
const activeForwards = new Map(); // port -> { server, ws }

function getRandomPort() {
  let port;
  do {
    port = Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1)) + MIN_PORT;
  } while (activeForwards.has(port));
  return port;
}

const wss = new WebSocketServer({ port: WS_PORT });
console.log(`PortIt server listening for clients on ws://${VPS_IP}:${WS_PORT}`);

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      ws.send(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    if (data.action === "add" && typeof data.localPort === "number") {
      const publicPort = getRandomPort();
      const tcpServer = net.createServer((socket) => {
        // When someone connects to the public port, pipe data to/from the client
        ws.send(JSON.stringify({ action: "incoming", port: publicPort }));
        // Forward data between socket and ws
        socket.on("data", (chunk) => ws.send(chunk));
        ws.on("message", (clientMsg) => {
          if (typeof clientMsg !== "string") socket.write(clientMsg);
        });
        socket.on("close", () => ws.send(JSON.stringify({ action: "socket_closed" })));
      });
      tcpServer.listen(publicPort, VPS_IP, () => {
        activeForwards.set(publicPort, { server: tcpServer, ws });
        ws.send(JSON.stringify({ action: "added", publicPort, vpsIp: VPS_IP }));
        console.log(`Forwarding set up: ${VPS_IP}:${publicPort} -> client`);
      });
      tcpServer.on("error", (err) => {
        ws.send(JSON.stringify({ error: err.message }));
      });
    }
    if (data.action === "remove" && typeof data.publicPort === "number") {
      const forward = activeForwards.get(data.publicPort);
      if (forward && forward.ws === ws) {
        forward.server.close();
        activeForwards.delete(data.publicPort);
        ws.send(JSON.stringify({ action: "removed", publicPort: data.publicPort }));
        console.log(`Forward for port ${data.publicPort} removed by client.`);
      } else {
        ws.send(JSON.stringify({ error: "No such forward or not owned by you." }));
      }
    }
  });
  ws.on("close", () => {
    // Clean up any forwards for this ws
    for (const [port, { ws: forwardWs, server }] of activeForwards.entries()) {
      if (forwardWs === ws) {
        server.close();
        activeForwards.delete(port);
        console.log(`Closed forward for port ${port}`);
      }
    }
  });
}); 