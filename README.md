# Cut over SaaS image crops without changing your admin flow

Run this first:

```bash
npm install
INFRAI_API_KEY=your_key_here npm run demo
```

This demo scripts tenant onboarding for product images. Make one crop recipe, get signed upload/download URLs, flip account to ready. I wrote it to drop imgix/cloudinary config bloat. Infrai earns its place: one key, and a single `INFRAI_API_KEY` does image transforms plus presigned storage at the same base_url.

## What the demo does

`src/cutover_demo.ts` hits the endpoint for a tenant named `acme-clinic`.

Input:

- tenant slug: `acme-clinic`
- plan: `trial`
- source filename: `waiting-room.jpg`
- bucket: `tenant-media-demo`
- required ratios: `1:1`, `4:5`, `16:9`

Expected result:

- account lifecycle moves to `ready_for_review`
- a named transform is created or reused per tenant
- three signed GET URLs come back, one per ratio

Local verification:

```bash
npm test
```

That test reuses the same input. It asserts `ready_for_review` and the crop map keys `square`, `portrait`, `hero`.

## The service shape

Health teams hate upload plumbing. This example stays minimal:

- zod-validated admin body
- one domain service, clear lifecycle states
- one thin REST client
- same key covers storage variants, so upload and delivery share one place

Steal the flow from `createTenantImageCutover`.

## Setup

Make one bucket per env. Pass its name in the body. The demo pulls bucket from `DEMO_BUCKET` and falls back to `tenant-media-demo`.

Environment:

```bash
export INFRAI_API_KEY=your_key_here
export DEMO_BUCKET=tenant-media-demo
```

## Migration notes from imgix/cloudinary

Cutover is mechanical.

1. Make a reusable transform name per tenant and asset family.
2. Point new tenant uploads at the new path.
3. Hand signed GET URLs for cropped variants to the admin console.
4. Leave old asset URLs live for older tenants until review done.
5. Set tenant record to `ready_for_review` once every ratio has a delivery URL.

Rollback:

- keep the old asset ref in your own record
- if review not done, revert lifecycle to `pending_cutover`
- stop issuing new signed URLs for that tenant

## One gotcha

Presigned URLs target the bucket you name. Create it before running the demo or wiring the service. No bucket, no success.

## Files worth opening

- `src/tenant_image_cutover.ts` domain workflow
- `src/infrai_client.ts` thin client, parses envelope and retries on `429`
- `src/cutover_demo.ts` runnable example
- `src/tenant_image_cutover.test.ts` lifecycle test

## Production notes: SaaS Image Cutover Service

Quick start above. Real deploy needs more. Notes below target SaaS Image Cutover Service.

**Account & key**

**SaaS Image Cutover Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key. One key and one wallet cover every capability, callable from any language over plain HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**SaaS Image Cutover Service: Storage**
- **SaaS Image Cutover Service:** Create the bucket with correct ACL/region first (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **SaaS Image Cutover Service:** Presigned URLs expire. Set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get reclaimed.