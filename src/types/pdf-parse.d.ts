declare module 'pdf-parse' {
  type PDFData = {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version: string;
  };
  function pdf(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PDFData>;
  export default pdf;
}
