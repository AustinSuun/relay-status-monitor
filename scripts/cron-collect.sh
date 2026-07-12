#!/bin/sh
set -eu

node <<'NODE'
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}

fetch('http://127.0.0.1:3000/api/cron/collect', {
  headers: { Authorization: `Bearer ${secret}` },
})
  .then(async (response) => {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${body}`);
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
NODE
