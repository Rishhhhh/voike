declare module 'parquetjs-lite' {
  export class ParquetReader {
    static openBuffer(buffer: Buffer): Promise<ParquetReader>;
    getCursor(): { next: () => Promise<Record<string, unknown> | null> };
    close(): Promise<void>;
  }
}
