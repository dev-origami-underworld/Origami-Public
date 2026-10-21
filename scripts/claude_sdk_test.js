#!/usr/bin/env node
require('dotenv').config();

const key = process.env.CLAUDE_API_KEY;
if(!key){
  console.error('Missing CLAUDE_API_KEY in environment or .env');
  process.exit(1);
}

(async ()=>{
  try{
    const {Anthropic} = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });
    // simple messages call
    const resp = await client.responses.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-4.7',
      input: process.env.CLAUDE_PROMPT || 'Say hello and identify yourself.'
    });
    console.log('SDK response:', JSON.stringify(resp, null, 2));
  }catch(err){
    console.error('SDK request failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
