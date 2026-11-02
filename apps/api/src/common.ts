import { BadRequestException, PipeTransform } from '@nestjs/common';
import { uuidv7 } from '@openbook/shared';
import { randomBytes } from 'node:crypto';

export const newId = () => uuidv7(Date.now(), (n) => new Uint8Array(randomBytes(n)));

interface SafeParser<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } };
}

/** Validates a request body with a zod schema shared from @openbook/shared. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: SafeParser<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException({ message: 'Validation failed', issues: result.error.issues });
    return result.data;
  }
}
