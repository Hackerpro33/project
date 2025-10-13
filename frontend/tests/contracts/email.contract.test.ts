import fs from 'node:fs';
import path from 'node:path';

import { PactV3 } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';

const PACT_DIR = path.resolve(__dirname, '../../..', 'contracts', 'pacts');
const CONTRACT_PATH = path.join(PACT_DIR, 'insight-frontend-insight-backend.json');

const REQUEST_BODY = {
  to: 'team@example.com',
  subject: 'Contract test',
  body: 'Please enqueue',
  from_name: 'Frontend'
};

const RESPONSE_BODY = {
  status: 'queued',
  logged: true
};

describe('frontend ↔ backend contract', () => {
  it('emits pact for send-email workflow', async () => {
    const provider = new PactV3({
      consumer: 'insight-frontend',
      provider: 'insight-backend',
      dir: PACT_DIR,
      pactfileWriteMode: 'overwrite'
    });

    provider
      .given('email log directory is writable')
      .uponReceiving('queue email for dispatch')
      .withRequest({
        method: 'POST',
        path: '/api/v1/utils/send-email',
        headers: { 'Content-Type': 'application/json' },
        body: REQUEST_BODY
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: RESPONSE_BODY
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/api/v1/utils/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY)
      });

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toEqual(RESPONSE_BODY);
    });

    const pactFile = fs.readFileSync(CONTRACT_PATH, 'utf-8');
    const pactJson = JSON.parse(pactFile);
    expect(pactJson.consumer.name).toBe('insight-frontend');
    expect(pactJson.provider.name).toBe('insight-backend');
    expect(pactJson.interactions).toHaveLength(1);
    expect(pactJson.interactions[0].request.path).toBe('/api/v1/utils/send-email');
  });
});
