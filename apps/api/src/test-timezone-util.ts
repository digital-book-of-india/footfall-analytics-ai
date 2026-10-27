import { zonedTimeToUtc, floorToLocalHourUtc, isValidTimeZone } from './utils/timezone.js';

let fails = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log('OK   - ' + label);
  else {
    fails++;
    console.log('FAIL - ' + label + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
  }
}

const midnightIst = zonedTimeToUtc(2026, 1, 1, 0, 0, 0, 'Asia/Kolkata');
check('IST local midnight -> correct UTC instant', midnightIst.toISOString() === '2025-12-31T18:30:00.000Z', midnightIst.toISOString());

const midnightEst = zonedTimeToUtc(2026, 1, 1, 0, 0, 0, 'America/New_York');
check('EST local midnight -> correct UTC instant', midnightEst.toISOString() === '2026-01-01T05:00:00.000Z', midnightEst.toISOString());

const midnightUtc = zonedTimeToUtc(2026, 1, 1, 0, 0, 0, 'UTC');
check('UTC local midnight -> identity', midnightUtc.toISOString() === '2026-01-01T00:00:00.000Z', midnightUtc.toISOString());

const bucket = floorToLocalHourUtc(new Date('2025-12-31T19:45:00Z'), 'Asia/Kolkata');
check('floorToLocalHourUtc floors to the correct IST hour bucket', bucket.toISOString() === '2025-12-31T19:30:00.000Z', bucket.toISOString());

const bucket2 = floorToLocalHourUtc(new Date('2025-12-31T18:45:00Z'), 'Asia/Kolkata');
check(
  "event just after IST midnight floors into hour-0 IST bucket (not UTC's hour-18)",
  bucket2.toISOString() === '2025-12-31T18:30:00.000Z',
  bucket2.toISOString()
);

check('isValidTimeZone accepts a real IANA zone', isValidTimeZone('Asia/Kolkata') === true);
check('isValidTimeZone rejects garbage', isValidTimeZone('Not/A/Zone') === false);

console.log('');
if (fails === 0) {
  console.log('ALL TIMEZONE UTILITY CHECKS PASSED');
} else {
  console.log(fails + ' CHECK(S) FAILED');
  process.exitCode = 1;
}
