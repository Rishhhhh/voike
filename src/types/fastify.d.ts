import 'fastify';
import { ProjectRecord } from '@auth/index';

declare module 'fastify' {
  interface FastifyRequest {
    project?: ProjectRecord;
  }
}
