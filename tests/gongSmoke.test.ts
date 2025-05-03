import axios from 'axios';
import { expect, test } from '@jest/globals';

const api = axios.create({
  baseURL: 'https://api.gong.io',
  auth: { username: process.env.GONG_ACCESS_KEY!, password: process.env.GONG_SECRET! }
});

test('auth works', async () => {
  const { status } = await api.get('/v2/users?limit=1');
  expect(status).toBe(200);
});

test('extensive wrapper', async () => {
  const { status } = await api.post('/v2/calls/extensive', {
    filter: { fromDateTime: '2025-04-30T00:00:00Z', toDateTime: '2025-04-30T23:59:59Z' }
  });
  expect(status).toBe(200);
});

test('brief endpoint', async () => {
  const { status } = await api.get('/v2/askanything/generate-brief', {
    params: {
      'workspace-id': '123',
      'brief-name': 'Churn risk signals',
      'entity-type': 'Deal',
      'crm-entity-id': '006Pc0000093OGjIAA',
      'period-type': 'LAST_90DAYS'
    }
  });
  // Gong returns 202 if async; accept either
  expect([200, 202]).toContain(status);
}); 