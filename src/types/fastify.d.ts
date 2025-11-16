import 'fastify';
import { ProjectRecord, UserRecord } from '@auth/index';

declare module 'fastify' {
  interface FastifyRequest {
    project?: ProjectRecord;
    user?: UserRecord;
  }
}
