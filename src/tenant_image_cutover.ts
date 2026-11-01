import { z } from 'zod';
import { createIdempotencyKey, InfraiClient } from './infrai_client.ts';

const ratioSpec = {
  square: '1:1',
  portrait: '4:5',
  hero: '16:9'
} as const;

export const tenantImageCutoverRequestSchema = z.object({
  tenantSlug: z.string().min(3).regex(/^[a-z0-9-]+$/),
  tenantPlan: z.enum(['trial', 'active', 'paused']),
  sourceFilename: z.string().min(3),
  sourceImageBase64: z.string().min(8),
  bucket: z.string().min(3),
  adminEmail: z.string().email()
});

export type TenantImageCutoverRequest = z.infer<typeof tenantImageCutoverRequestSchema>;

export type TenantLifecycle = 'pending_cutover' | 'ready_for_review';

export type TenantImageCutoverResult = {
  tenantSlug: string;
  lifecycle: TenantLifecycle;
  transformationName: string;
  uploadTarget: {
    objectKey: string;
    putUrl: string;
  };
  croppedVariants: Record<keyof typeof ratioSpec, string>;
};

export async function createTenantImageCutover(
  infrai: InfraiClient,
  input: TenantImageCutoverRequest
): Promise<TenantImageCutoverResult> {
  const req = tenantImageCutoverRequestSchema.parse(input);
  const objectKey = `tenants/${req.tenantSlug}/brand/${req.sourceFilename}`;
  const transformationName = `${req.tenantSlug}-brand-crops`;

  await ensureReusableTransformation(infrai, transformationName);

  const putPresign = await infrai.storage.object.presign(req.bucket, objectKey, {
    op: 'put',
    expires_seconds: 900,
    content_type: 'image/jpeg',
    max_bytes: 8_000_000,
    idempotency_key: createIdempotencyKey(`put-${req.tenantSlug}`)
  });

  await infrai.image.upload({
    file: req.sourceImageBase64,
    filename: req.sourceFilename
  });

  const croppedVariants = {
    square: await getVariantUrl(infrai, req.bucket, req.tenantSlug, req.sourceFilename, 'square'),
    portrait: await getVariantUrl(infrai, req.bucket, req.tenantSlug, req.sourceFilename, 'portrait'),
    hero: await getVariantUrl(infrai, req.bucket, req.tenantSlug, req.sourceFilename, 'hero')
  };

  const lifecycle: TenantLifecycle = Object.keys(croppedVariants).length === 3
    ? 'ready_for_review'
    : 'pending_cutover';

  return {
    tenantSlug: req.tenantSlug,
    lifecycle,
    transformationName,
    uploadTarget: {
      objectKey,
      putUrl: putPresign.url
    },
    croppedVariants
  };
}

async function ensureReusableTransformation(infrai: InfraiClient, transformationName: string): Promise<void> {
  const existing = await infrai.image.transformation.list();
  const alreadyPresent = existing.some((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    return candidate.name === transformationName;
  });

  if (alreadyPresent) {
    return;
  }

  await infrai.image.transformation.create({
    name: transformationName,
    transform: { operation: 'smart_crop' }
  });
}

async function getVariantUrl(
  infrai: InfraiClient,
  bucket: string,
  tenantSlug: string,
  sourceFilename: string,
  variant: keyof typeof ratioSpec
): Promise<string> {
  const key = `tenants/${tenantSlug}/brand/${variant}-${sourceFilename}`;
  const result = await infrai.storage.object.presign(bucket, key, {
    op: 'get',
    expires_seconds: 900,
    response_disposition: 'inline'
  });
  return result.url;
}
