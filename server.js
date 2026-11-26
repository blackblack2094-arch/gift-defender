const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
});

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  let conn = null;
  const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
  const stop = () => { try { conn && conn.disconnect(); } catch (e) {} conn = null; };

  ws.on('message', async raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type !== 'connect') return;
    stop();
    const user = String(m.username || '').replace('@', '').trim();
    if (!user) return send({ type: 'status', text: 'ใส่ชื่อ TikTok ก่อน' });

    send({ type: 'status', text: 'กำลังเชื่อมต่อ...' });
    conn = new TikTokLiveConnection(user);
    conn.on(WebcastEvent.GIFT, d => {
      if (d.giftType === 1 && !d.repeatEnd) return; // streak still running: wait for the final count
      send({
        type: 'gift',
        user: d.user?.uniqueId ?? d.uniqueId ?? 'viewer',
        gift: d.giftName,
        diamonds: d.diamondCount,
        count: d.repeatCount || 1
      });
    });
    conn.on(WebcastEvent.DISCONNECTED, () => send({ type: 'status', text: 'หลุดการเชื่อมต่อจาก TikTok' }));
    try {
      await conn.connect();
      send({ type: 'status', text: 'เชื่อมต่อแล้ว @' + user });
    } catch (e) {
      console.error(e);
      send({ type: 'status', text: 'เชื่อมต่อไม่ได้: ต้องกำลังไลฟ์อยู่ และชื่อต้องถูกต้อง' });
    }
  });

  ws.on('close', stop);
});

server.listen(process.env.PORT || 3000, () => console.log('running'));
