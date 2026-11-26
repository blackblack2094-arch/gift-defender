const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const lib = require('tiktok-live-connector');

console.log('lib exports:', Object.keys(lib).join(', '));
const Conn = lib.TikTokLiveConnection || lib.WebcastPushConnection;
const GIFT = (lib.WebcastEvent && lib.WebcastEvent.GIFT) || 'gift';
const DISC = (lib.ControlEvent && lib.ControlEvent.DISCONNECTED) ||
             (lib.WebcastEvent && lib.WebcastEvent.DISCONNECTED) || 'disconnected';

// never let one bad connection crash the whole server
process.on('uncaughtException', e => console.error('uncaught:', e));
process.on('unhandledRejection', e => console.error('unhandled:', e));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
});

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  let conn = null;
  const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
  const stop = () => { try { conn && conn.disconnect(); } catch (e) {} conn = null; };
  ws.on('error', e => console.error('ws error:', e.message));

  ws.on('message', async raw => {
    try {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type !== 'connect') return;
      stop();
      const user = String(m.username || '').replace('@', '').trim();
      if (!user) return send({ type: 'status', text: 'ใส่ชื่อ TikTok ก่อน' });
      if (!Conn) return send({ type: 'status', text: 'ไลบรารีไม่ตรงเวอร์ชัน: ' + Object.keys(lib).join(',') });

      send({ type: 'status', text: 'กำลังเชื่อมต่อ...' });
      conn = new Conn(user);
      conn.on(GIFT, d => {
        console.log('gift raw:', JSON.stringify(d).slice(0, 400));
        const gd = d.giftDetails || {};
        const type = d.giftType ?? gd.giftType;
        if (type === 1 && !d.repeatEnd) return; // streak still running: wait for final count
        send({
          type: 'gift',
          user: d.user?.uniqueId ?? d.uniqueId ?? 'viewer',
          gift: d.giftName ?? gd.giftName ?? 'gift',
          diamonds: d.diamondCount ?? gd.diamondCount ?? 1,
          count: d.repeatCount || 1
        });
      });
      conn.on(DISC, () => send({ type: 'status', text: 'หลุดการเชื่อมต่อจาก TikTok' }));
      await conn.connect();
      send({ type: 'status', text: 'เชื่อมต่อแล้ว @' + user });
    } catch (e) {
      console.error('connect failed:', e);
      send({ type: 'status', text: 'เชื่อมต่อไม่ได้: ' + (e && e.message ? e.message : e) });
    }
  });

  ws.on('close', stop);
});

server.listen(process.env.PORT || 3000, () => console.log('running'));
