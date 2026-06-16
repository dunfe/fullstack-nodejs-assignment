import { BadRequestException } from '@nestjs/common';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { FileImportExecutor } from './file-import.executor';

interface SuccessResult {
  path: string;
  status: 'success';
  sizeBytes: number;
  parsedData: unknown;
}

interface FailedResult {
  path: string;
  status: 'failed';
  error: string;
}

type ExpectedFileResult = SuccessResult | FailedResult;

describe('FileImportExecutor', () => {
  let executor: FileImportExecutor;
  const tempDir = join(process.cwd(), 'temp-test-imports');

  beforeAll(async () => {
    executor = new FileImportExecutor();
    try {
      await mkdir(tempDir, { recursive: true });
    } catch {
      // Ignore if dir already exists
    }
  });

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Clean up temp-test-imports
    }
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  it('should throw BadRequestException if payload is not an object', async () => {
    await expect(executor.execute(null)).rejects.toThrow(BadRequestException);
    await expect(executor.execute([])).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if paths is not an array', async () => {
    await expect(executor.execute({})).rejects.toThrow(BadRequestException);
    await expect(
      executor.execute({
        paths: 'not-an-array',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should successfully parse JSON, CSV and fallback files, and report success/failed counts', async () => {
    const jsonPath = join(tempDir, 'data.json');
    const csvPath = join(tempDir, 'data.csv');
    const txtPath = join(tempDir, 'data.txt');
    const missingPath = join(tempDir, 'missing.json');

    // Write test files
    await writeFile(
      jsonPath,
      JSON.stringify({ key: 'value', numbers: [1, 2, 3] }),
    );
    await writeFile(
      csvPath,
      'id,name,role\n1,Alice,Developer\n2,Bob,Product Owner\n3,Charlie,Designer',
    );
    await writeFile(txtPath, 'Line 1\nLine 2\nLine 3');

    const relativeJson = jsonPath.replace(process.cwd() + '/', '');
    const relativeCsv = csvPath.replace(process.cwd() + '/', '');
    const relativeTxt = txtPath.replace(process.cwd() + '/', '');
    const relativeMissing = missingPath.replace(process.cwd() + '/', '');

    const result = await executor.execute({
      paths: [relativeJson, relativeCsv, relativeTxt, relativeMissing],
    });

    expect(result).toBeDefined();
    expect(result.totalFiles).toBe(4);
    expect(result.successCount).toBe(3);
    expect(result.failedCount).toBe(1);

    const files = result.files as unknown as ExpectedFileResult[];
    expect(files).toHaveLength(4);

    // 1. JSON File Assertion
    const jsonFile = files.find(
      (f) => f.path === relativeJson,
    ) as SuccessResult;
    expect(jsonFile).toBeDefined();
    expect(jsonFile.status).toBe('success');
    expect(jsonFile.parsedData).toEqual({ key: 'value', numbers: [1, 2, 3] });
    expect(jsonFile.sizeBytes).toBeGreaterThan(0);

    // 2. CSV File Assertion
    const csvFile = files.find((f) => f.path === relativeCsv) as SuccessResult;
    expect(csvFile).toBeDefined();
    expect(csvFile.status).toBe('success');
    expect(csvFile.parsedData).toEqual([
      { id: '1', name: 'Alice', role: 'Developer' },
      { id: '2', name: 'Bob', role: 'Product Owner' },
      { id: '3', name: 'Charlie', role: 'Designer' },
    ]);

    // 3. Plain Text File Assertion (should fallback to lines)
    const txtFile = files.find((f) => f.path === relativeTxt) as SuccessResult;
    expect(txtFile).toBeDefined();
    expect(txtFile.status).toBe('success');
    expect(txtFile.parsedData).toEqual(['Line 1', 'Line 2', 'Line 3']);

    // 4. Missing File Assertion
    const missingFile = files.find(
      (f) => f.path === relativeMissing,
    ) as FailedResult;
    expect(missingFile).toBeDefined();
    expect(missingFile.status).toBe('failed');
    expect(missingFile.error).toContain('ENOENT');
  });
});
