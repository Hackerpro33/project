import { describe, it, expect } from 'vitest';

import en from '@/locales/en/common.json';
import ru from '@/locales/ru/common.json';

function flattenKeys(object, prefix = '') {
  return Object.entries(object).reduce((keys, [key, value]) => {
    const current = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, current));
    } else {
      keys.push(current);
    }
    return keys;
  }, []);
}

describe('i18n resources', () => {
  it('expose matching key sets for English and Russian locales', () => {
    const enKeys = flattenKeys(en).sort();
    const ruKeys = flattenKeys(ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });
});
