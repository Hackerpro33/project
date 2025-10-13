import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(95)<2500'],
    http_req_failed: ['rate<0.01']
  }
};

const BASE_URL = `${__ENV.K6_BASE_URL ?? 'http://localhost:8000'}`;
const API_PREFIX = '/api/v1';
const FILE_BYTES = open('./fixtures/sample.csv', 'b');

export default function () {
  const res = http.post(
    `${BASE_URL}${API_PREFIX}/upload`,
    { file: http.file(FILE_BYTES, 'sample.csv', 'text/csv') }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'quick extraction returned': (r) => r.json('quick_extraction') !== undefined,
  });

  sleep(1);
}
