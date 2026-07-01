/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { generateText, tool } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');
const { z } = require('zod');

async function main() {
  const custom = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-test',
    baseURL: 'https://api.openai.com/v1'
  });

  const tools = {
    murici__state_graph: tool({
      description: 'Get state graph',
      parameters: z.object({}),
    })
  };

  const result = await generateText({
    model: custom('gpt-3.5-turbo'),
    messages: [{ role: 'user', content: 'What is the state graph?' }],
    tools
  });

  console.log("result.text:", result.text);
  console.log("result.text type:", typeof result.text);
  console.log("result.text || '' :", result.text || "");
}
main().catch(console.error);
