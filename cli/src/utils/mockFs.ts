import { DirectoryJSON, Volume } from 'memfs/lib/volume';
import { vi } from 'vitest';

export const relativeToCwdFiles = (files: Record<string, string>): Record<string, string> => {
  return Object.entries(files).reduce((acc, [key, value]) => {
    const newKey = key.replace('$PWD', process.cwd());
    return { ...acc, [newKey]: value };
  }, {});
};

export const cwdToRelativeFiles = (files: DirectoryJSON): Record<string, string> =>
  Object.entries(files).reduce((acc, [key, value]) => {
    const newKey = key.replace(process.cwd(), '$PWD');
    return { ...acc, [newKey]: value };
  }, {});

export function mockFsMethods(fs: typeof import('fs'), fsPromises: typeof import('fs/promises'), vol: Volume) {
  const fsMethods = Object.getOwnPropertyNames(fs);

  fsMethods.forEach((method) => {
    if (typeof fs[method as keyof typeof fs] === 'function') {
      vi.spyOn(fs, method).mockImplementation(vol[method as keyof typeof vol]);
    }
  });

  const methods = Object.getOwnPropertyNames(fsPromises);

  methods.forEach((method) => {
    if (typeof fsPromises[method as keyof typeof fsPromises] === 'function') {
      vi.spyOn(fsPromises, method).mockImplementation(vol.promises[method as keyof typeof vol.promises]);
    }
  });
  vi.doMock('fs', () => vol)
  vi.doMock('fs/promises', () => vol)
}
