import { UnrecoverableError } from 'bullmq';
import { CHECK_NO_COMMUNICATION_JOB, checkNoCommunicationJob } from './jobs/check-no-communication';
import { PURGE_SESSIONS_JOB, purgeSessionsJob, type JobDeps } from './jobs/purge-sessions';

export interface ProcessableJob {
  name: string;
  data: unknown;
}

/**
 * Roteia jobs para seus handlers. Erros normais fazem o BullMQ tentar de novo (limite de tentativas +
 * backoff exponencial, ver queues.ts); job desconhecido é definitivo e não deve ser repetido.
 */
export function createProcessor(deps: JobDeps): (job: ProcessableJob) => Promise<unknown> {
  return async (job) => {
    switch (job.name) {
      case PURGE_SESSIONS_JOB:
        return purgeSessionsJob(deps, job.data);
      case CHECK_NO_COMMUNICATION_JOB:
        return checkNoCommunicationJob(deps, job.data);
      default:
        throw new UnrecoverableError(`Job desconhecido: ${job.name}`);
    }
  };
}
