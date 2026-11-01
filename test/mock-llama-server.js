// A fake llama-server.exe for tests: same command-line flags and HTTP endpoints, scripted replies.
import http from 'node:http';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (f) => argv[argv.indexOf(f) + 1];
const port = Number(arg('--port'));
const modelFile = path.basename(arg('-m'));
const readyAt = Date.now() + 800;

http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  if (req.url === '/health') { res.writeHead(Date.now() > readyAt ? 200 : 503); return res.end('{}'); }
  if (req.url === '/v1/chat/completions') {
    const j = JSON.parse(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (delta) => res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
    const msgs = j.messages, last = msgs.at(-1);
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';
    // Every tool message must answer a tool call id from the assistant message before it.
    const ids = new Set(msgs.flatMap((m) => (m.tool_calls || []).map((t) => t.id)));
    const badIds = msgs.filter((m) => m.role === 'tool' && !ids.has(m.tool_call_id)).length;
    if (last.role === 'tool' && /notice board is empty/i.test(last.content)) {
      send({ tool_calls: [{ index: 0, id: 'x2', type: 'function', function: { name: 'notice_board', arguments: '' } }] });
      send({ tool_calls: [{ index: 0, function: { arguments: '{"action":"write","content":"# Notice board\\n- [ ] Llama quest"}' } }] });
    } else if (last.role === 'tool') {
      send({ content: `Done (bad ids: ${badIds}).` });
    } else if (/board/i.test(lastUser)) {
      send({ tool_calls: [{ index: 0, id: 'x1', type: 'function', function: { name: 'notice_board', arguments: '{"action":' } }] });
      send({ tool_calls: [{ index: 0, function: { arguments: '"read"}' } }] });
    } else {
      for (const w of `Hello from ${modelFile}. `.split(/(?<= )/)) send({ content: w });
    }
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  res.writeHead(404); res.end();
}).listen(port, '127.0.0.1');
