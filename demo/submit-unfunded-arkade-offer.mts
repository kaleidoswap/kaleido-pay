// Explicit signet-only create probe. Never funds a lockup or invokes a pay API.
import { readFile, writeFile } from 'node:fs/promises';
import { createECDH } from 'node:crypto';
import { resolve } from 'node:path';
import { buildOfferRequest, inspectCreateResponse } from './bolt12-arkade-preflight';

if (!process.argv.includes('--create-unfunded')) throw new Error('Pass --create-unfunded after the fetch-only node fix is deployed.');
const dir = resolve(process.env.KALEIDOPAY_NODE_DIR ?? '../kaleidoswap-maker-rs/e2e/signet-smoke/run');
const offer = JSON.parse(await readFile(resolve(dir,'kaleidopay-offer.json'),'utf8')).offer;
const key = createECDH('secp256k1'); key.generateKeys();
const request = buildOfferRequest(offer,20000,key.getPublicKey('hex','compressed'));
const run = `kaleidopay-unfunded-${Date.now()}`;
await writeFile(resolve(dir,`${run}-refund.json`),JSON.stringify({privateKey:key.getPrivateKey('hex'),publicKey:request.refundPublicKey}),{mode:0o600,flag:'wx'});
const response = await fetch('https://maker.signet.kaleidoswap.com/v2/swap/submarine',{
 method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(45000),
});
const body = await response.json();
await writeFile(resolve(dir,`${run}-response.json`),JSON.stringify(body,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({httpStatus:response.status,run,...inspectCreateResponse(body,20000)},null,2));
if (!response.ok) process.exitCode=1;
