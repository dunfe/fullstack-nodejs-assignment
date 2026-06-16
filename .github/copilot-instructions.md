# GitHub Copilot Instructions for Schedule Task Application

This document provides architecture context, key conventions, and command instructions for AI assistants and developers working on the Schedule Task Application.

---

## 1. Build, Test, and Lint Commands

The project uses **Yarn v4** (`yarn@4.16.0`) as its package manager. Avoid using `npm` commands.

### Build and Run
- **Install Dependencies**: `yarn install`
- **Build Project**: `yarn build`
- **Run in Development (Watch Mode)**: `yarn start:dev`
- **Run in Production Mode**: `yarn start:prod`

### Linting and Formatting
- **Lint Code**: `yarn lint`
- **Format Code**: `yarn format`

### Testing
- **Run All Unit Tests**: `yarn test`
- **Run a Single Unit Test**: `yarn test src/schedules/schedules.service.spec.ts` (or `npx jest src/schedules/schedules.service.spec.ts`)
- **Run Unit Tests in Watch Mode**: `yarn test:watch`
- **Run E2E Tests**: `yarn test:e2e`
- **Run Test Coverage**: `yarn test:cov`

### Scripts and Tools Execution
- **Important**: Use `npx tsx` instead of `ts-node` to run standalone TypeScript scripts or tools within this codebase.

---

## 2. High-Level Architecture

The application is built using **NestJS** and **Prisma ORM** with PostgreSQL and Redis. It is a distributed schedule task runner utilizing a database-driven polling and claim model.

### Codebase Layout
- `prisma/`: Prisma schema, migrations, and a custom module/service wrapping the DB client.
- `src/common/`: Shared interceptors, filters, and types (e.g., correlation ID handling, global exceptions).
- `src/schedules/`: Main module containing REST endpoints, database access, scheduler daemon, and task executors.

### Key Components & Interactions
1. **Global Request Lifecycle**:
   - **Correlation Interceptor** (`src/common/interceptors/correlation-id.interceptor.ts`): Injects a unique trace `correlationId` into the request object and attaches it as `x-correlation-id` in response headers.
   - **Global Exception Filter** (`src/common/filters/global-exception.filter.ts`): Intercepts all unhandled errors, logs them along with their correlation ID, and returns a standardized error envelope.

2. **Core Scheduler Engine**:
   - **DB-Driven Claim Pattern**: Designed to run safely across multiple scaled-out server instances without race conditions.
   - **Polling Tick** (`src/schedules/scheduler/scheduler-scanner.service.ts`): A NestJS `@Cron` job that queries the database every 5 seconds for due tasks (`PENDING` or `RETRYING` tasks where `nextRunAt` or `scheduleAt` $\le$ `now`).
   - **Atomic Claim** (`src/schedules/schedules.repository.ts`): Uses a Prisma `updateMany` operation to atomically update the task status from `PENDING` / `RETRYING` to `RUNNING`, incrementing the `attemptCount`. If the query returns a count of `0`, the task was already claimed by another runner and is skipped.
   - **Execution Logging**: Each execution creates a `TaskRun` record with its own log status, standard/error outputs, and trace correlation ID.

3. **Task Executor System**:
   - Standardized around the `TaskExecutor` interface (`src/schedules/executors/task-executor.interface.ts`).
   - Managed via the `TaskExecutorRegistry` (`src/schedules/executors/task-executor.registry.ts`) resolving executors based on `TaskType`.
   - **File Read Executor** (`src/schedules/executors/file-read.executor.ts`) is currently implemented; others (such as `FILE_IMPORT`, `FORM_FILL`, `EMAIL`) are planned.

---

## 3. Key Conventions

When extending or modifying this codebase, adhere to the following patterns:

### Adding a New Task Executor
To add a new executor type (e.g., `EMAIL`, `FILE_IMPORT`, `FORM_FILL`):
1. **Implement the Executor**: Create a class implementing `TaskExecutor` in `src/schedules/executors/`.
2. **Registry Injection**: Inject the new executor class into `TaskExecutorRegistry` and add it to the internal map using `this.executors.set(newExecutor.type, newExecutor)`.
3. **Module Registration**: Add the class to the `providers` array in `src/schedules/schedules.module.ts`.
4. **Validation rules**: Add payload-level validation logic to `TaskPayloadValidator` (`src/schedules/validators/task-payload.validator.ts`) to validate DTO inputs.

### Idempotency & Deduplication
- Creating a scheduled task via `/api/schedules/push` expects a unique `idempotencyKey`.
- Before task creation, the service queries the database for an existing key. If found, it returns the existing task object directly (preventing duplicates caused by network retries) instead of throwing a conflict or creating a new record.

### Prisma Code Generation
- The Prisma client is configured to output to a custom location: `generated/prisma` instead of `node_modules`.
- Imports should be resolved from `generated/prisma` or relative paths depending on compilation and NodeNext compatibility.

### Module Configuration
- All new controllers or services must be explicitly declared within NestJS modules. Do not rely on loose class injections.
- Maintain modern ESM/CommonJS `nodenext` compatibility in all file exports and imports.
