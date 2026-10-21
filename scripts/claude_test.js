#!/usr/bin/env node
require('dotenv').config();

const key = process.env.CLAUDE_API_KEY;
if(!key){
  console.error('Missing CLAUDE_API_KEY in environment or .env');
  process.exit(1);
}

const endpoint = 'https://api.anthropic.com/v1/messages';

const body = {
  model: process.env.CLAUDE_MODEL || 'claude-opus-4.7',
  messages: [
    { role: 'user', content: process.env.CLAUDE_PROMPT || 'Say hello and identify yourself.' }
  ],
  max_tokens_to_sample: 300,
  temperature: 0.2
};

const candidateVersions = [
  '2023-08-01',
  '2023-10-17',
  '2024-06-01',
  '2024-12-18',
  '2025-10-02',
  '2025-11-01'
];

(async ()=>{
  if(typeof fetch !== 'function'){
    console.error('Global fetch not available. Use Node 18+ or run with a fetch polyfill.');
    process.exit(1);
  }

  let lastErr = null;
  const headerVariants = [
    { keyName: 'x-api-key', auth: false },
    { keyName: 'Authorization', auth: true }
  ];

  for(const ver of candidateVersions){
    for(const hv of headerVariants){
      try{
        const headers = { 'Content-Type': 'application/json', 'anthropic-version': ver };
        if(hv.auth) headers['Authorization'] = `Bearer ${key}`;
        else headers['x-api-key'] = key;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          // short timeout via AbortController could be added if needed
        });
        const text = await res.text();
        const attemptId = `${hv.auth ? 'Bearer' : 'x-api-key'} @ ${ver}`;
        if(res.ok){
          try{ console.log('Success with', attemptId); console.log(JSON.stringify(JSON.parse(text), null, 2)); }
          catch(e){ console.log('Success body:', text); }
          process.exit(0);
        }else{
          console.error('Attempt',attemptId,'failed:',res.status,text);
          lastErr = {attempt:attemptId,ver,status:res.status,body:text};
        }
      }catch(err){
        console.error('Request error with',hv,ver,err && err.message ? err.message : err);
        lastErr = {hv,ver,error:err && err.message ? err.message : err};
      }
    }
  }

  console.error('All candidate versions failed. Last error:', lastErr);
  process.exit(1);
})();
