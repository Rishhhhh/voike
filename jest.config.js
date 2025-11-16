module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@config$': '<rootDir>/src/config',
    '^@kernel8/(.*)$': '<rootDir>/src/kernel8/$1',
    '^@kernel9/(.*)$': '<rootDir>/src/kernel9/$1',
    '^@semantic/(.*)$': '<rootDir>/src/semantic_kernel/$1',
    '^@uie/(.*)$': '<rootDir>/src/uie/$1',
    '^@vdb/(.*)$': '<rootDir>/src/vdb/$1',
    '^@mcp/(.*)$': '<rootDir>/src/mcp/$1',
    '^@ledger/(.*)$': '<rootDir>/src/ledger/$1',
    '^@runtime/(.*)$': '<rootDir>/src/runtime/$1',
    '^@telemetry/(.*)$': '<rootDir>/src/telemetry/$1',
    '^@auth/(.*)$': '<rootDir>/src/auth/$1'
  }
};
