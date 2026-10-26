import { describe, expect, it } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { isHandleUniqueViolation } from './handle-unique-violation';

function wrappedPostgresError(constraintName: string) {
  const postgresError = Object.assign(new Error('duplicate key'), {
    code: '23505',
    constraint_name: constraintName,
  });
  return new DrizzleQueryError('insert into users', [], postgresError);
}

describe('PostgreSQL handle uniqueness errors', () => {
  it('recognizes only the users handle unique constraint', () => {
    expect(isHandleUniqueViolation({ code: '23505', constraint_name: 'users_handle_unique' })).toBe(true);
    expect(isHandleUniqueViolation({ code: '23505', constraint: 'users_handle_unique' })).toBe(true);
    expect(isHandleUniqueViolation(wrappedPostgresError('users_handle_unique'))).toBe(true);
    expect(isHandleUniqueViolation({ code: '23505', constraint: 'users_email_unique' })).toBe(false);
    expect(isHandleUniqueViolation(wrappedPostgresError('users_email_unique'))).toBe(false);
    expect(isHandleUniqueViolation({ code: '23503', constraint: 'users_handle_unique' })).toBe(false);
    expect(isHandleUniqueViolation(new Error('duplicate key'))).toBe(false);
    expect(isHandleUniqueViolation(null)).toBe(false);
  });

  it('stops safely on cyclic causes', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isHandleUniqueViolation(cyclic)).toBe(false);
  });
});
