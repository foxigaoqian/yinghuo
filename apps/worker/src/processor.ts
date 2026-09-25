export type DemoJob = { type: 'photo-restore' | 'moderation'; mock: true; referenceId: string };
export async function processDemoJob(job: DemoJob) {
  if (job.mock !== true || !['photo-restore', 'moderation'].includes(job.type))
    throw new Error('Unsupported job');
  return {
    mock: true,
    referenceId: job.referenceId,
    status: job.type === 'moderation' ? 'pending_manual_review' : 'provider_not_connected',
    outputAssetId: null,
  };
}
