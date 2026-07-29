import { describe, expect, it } from 'vitest';
import { LatestRequest } from './latest-request.js';

describe('LatestRequest', () => {
  it('only keeps the newest request current', () => {
    const requests = new LatestRequest();
    const first = requests.begin();
    const second = requests.begin();

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('invalidates a request without starting another one', () => {
    const requests = new LatestRequest();
    const request = requests.begin();

    requests.invalidate();

    expect(request.isCurrent()).toBe(false);
  });
});
