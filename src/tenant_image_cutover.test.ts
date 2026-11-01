import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantImageCutover } from './tenant_image_cutover.ts';
import { InfraiClient } from './infrai_client.ts';

function createFetchStub() {
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/v1/image/transformation/list') && method === 'GET') {
      return Response.json({ ok: true, data: { items: [] }, metadata: {} }, { status: 200 });
    }

    if (url.endsWith('/v1/image/transformation/create') && method === 'POST') {
      return Response.json({ ok: true, data: { name: 'acme-clinic-brand-crops' }, metadata: {} }, { status: 200 });
    }

    if (url.endsWith('/v1/image/upload') && method === 'POST') {
      return Response.json({ ok: true, data: { id: 'img_123' }, metadata: {} }, { status: 200 });
    }

    if (url.includes('/v1/storage/object/presign/') && method === 'POST') {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { op?: string };
      const suffix = parsed.op === 'put' ? 'upload' : 'delivery';
      return Response.json({ ok: true, data: { url: `https://signed.example/${suffix}` }, metadata: {} }, { status: 200 });
    }

    return Response.json({ ok: false, error: { message: `unexpected ${method} ${url}` }, metadata: {} }, { status: 400 });
  };
}

test('tenant onboarding becomes ready_for_review when all three crop URLs are issued', async () => {
  const infrai = new InfraiClient('test-key', createFetchStub() as typeof fetch);

  const result = await createTenantImageCutover(infrai, {
    tenantSlug: 'acme-clinic',
    tenantPlan: 'trial',
    sourceFilename: 'waiting-room.jpg',
    sourceImageBase64: 'ZmFrZS1pbWFnZS1ieXRlcw==',
    bucket: 'tenant-media-demo',
    adminEmail: 'admin@acme-clinic.example'
  });

  assert.equal(result.lifecycle, 'ready_for_review');
  assert.deepEqual(Object.keys(result.croppedVariants), ['square', 'portrait', 'hero']);
  assert.equal(result.transformationName, 'acme-clinic-brand-crops');
  assert.equal(result.uploadTarget.putUrl, 'https://signed.example/upload');
  assert.equal(result.croppedVariants.square, 'https://signed.example/delivery');
});
