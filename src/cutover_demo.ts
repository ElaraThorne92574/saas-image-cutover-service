import { createInfrai } from './infrai_client.ts';
import { createTenantImageCutover } from './tenant_image_cutover.ts';

async function main(): Promise<void> {
  const infrai = createInfrai();

  const result = await createTenantImageCutover(infrai, {
    tenantSlug: 'acme-clinic',
    tenantPlan: 'trial',
    sourceFilename: 'waiting-room.jpg',
    sourceImageBase64: 'ZmFrZS1pbWFnZS1ieXRlcw==',
    bucket: process.env.DEMO_BUCKET ?? 'tenant-media-demo',
    adminEmail: 'admin@acme-clinic.example'
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
