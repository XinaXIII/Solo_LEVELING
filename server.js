import http from 'node:http';import fs from 'node:fs';import crypto from 'node:crypto';
const E=process.env,BASE=E.PUBLIC_URL||E.RENDER_EXTERNAL_URL,TG=`https://api.telegram.org/bot${E.BOT_TOKEN}/`;
const HOOK='/tg/'+crypto.createHash('sha256').update(E.BOT_TOKEN||'').digest('hex').slice(0,20);
const tg=(m,b)=>fetch(TG+m,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));

// Пускаем только тебя: проверяем подпись Telegram (initData) и твой ID
function auth(init){
  if(!init||!E.BOT_TOKEN)return false;
  const p=new URLSearchParams(init),h=p.get('hash');p.delete('hash');
  const s=[...p.entries()].map(([k,v])=>k+'='+v).sort().join('\n');
  const k=crypto.createHmac('sha256','WebAppData').update(E.BOT_TOKEN).digest();
  if(crypto.createHmac('sha256',k).update(s).digest('hex')!==h)return false;
  try{return String(JSON.parse(p.get('user')).id)===E.ALLOWED_ID}catch{return false}
}

// Любой OpenAI-совместимый ИИ: DeepSeek, OpenRouter, Gemini, Ollama...
async function ai({messages,vision,cfg={}}){
  const img=vision&&vision.length,c=img?(cfg.v||{}):(cfg.t||{});
  const base=(c.base||(img?E.VISION_BASE_URL:E.AI_BASE_URL||'https://api.deepseek.com')||'').replace(/\/$/,'');
  const key=c.key||(img?E.VISION_KEY:E.AI_KEY),model=c.model||(img?E.VISION_MODEL:E.AI_MODEL||'deepseek-chat');
  if(!base||!model)throw new Error('Для фото настрой модель с поддержкой картинок во вкладке ИИ');
  const m=messages.map(x=>({...x}));
  if(img){const l=m[m.length-1];l.content=[{type:'text',text:l.content},...vision.map(u=>({type:'image_url',image_url:{url:u}}))]}
  const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',...(key?{authorization:'Bearer '+key}:{})},body:JSON.stringify({model,messages:m})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error((j.error&&j.error.message)||'HTTP '+r.status);
  return j.choices[0].message.content;
}

http.createServer(async(q,s)=>{
  const send=(c,b,t='application/json')=>{s.writeHead(c,{'content-type':t});s.end(b)};
  try{
    if(q.method==='GET'&&(q.url==='/'||q.url.startsWith('/?')))return send(200,fs.readFileSync('public/index.html'),'text/html; charset=utf-8');
    if(q.method==='POST'){
      let b='';for await(const ch of q){b+=ch;if(b.length>9e6)return send(413,'{}')}
      const j=JSON.parse(b||'{}');
      if(q.url===HOOK){
        send(200,'{}');const m=j.message;
        if(m&&String(m.from.id)===E.ALLOWED_ID)await tg('sendMessage',{chat_id:m.chat.id,text:'⚔ Система активирована, игрок.',reply_markup:{inline_keyboard:[[{text:'Открыть Систему',web_app:{url:BASE}}]]}});
        return;
      }
      if(q.url==='/api/ai'){
        if(!auth(q.headers['x-init']))return send(403,JSON.stringify({error:'Доступ только из Telegram и только для владельца'}));
        return send(200,JSON.stringify({text:await ai(j)}));
      }
    }
    send(404,'{}');
  }catch(err){send(500,JSON.stringify({error:String(err.message||err)}))}
}).listen(E.PORT||3000,async()=>{
  if(E.BOT_TOKEN&&BASE){
    await tg('setWebhook',{url:BASE+HOOK});
    await tg('setChatMenuButton',{menu_button:{type:'web_app',text:'Система',web_app:{url:BASE}}});
  }
  console.log('ok');
});
