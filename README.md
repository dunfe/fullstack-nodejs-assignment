# Resilient Distributed Task Scheduler & Executor Engine

A high-performance, resilient, and distributed task scheduling and execution engine built using **NestJS**, **Prisma ORM**, **PostgreSQL**, **Redis**, and **React**. It utilizes a database-driven polling and atomic claim model designed to run safely across multiple scaled-out server instances without race conditions or duplicate execution.

---

## 🚀 Key Features

* **Distributed Polling & Atomic Claim Model**: Safely scales horizontally. Runners query due tasks and claim them atomically using Prisma's transactional updates, ensuring each task is executed exactly once even when multiple runner instances are active.
* **Pluggable Task Executor System**: Supports multiple executor types out-of-the-box:
  * `FILE_READ`: Read and process structured files.
  * `FILE_IMPORT`: Perform data import pipelines.
  * `FORM_FILL`: Automate form submissions and ingestion.
  * `EMAIL`: Reliable SMTP communication with built-in retries and fallback modes.
* **Idempotency & Deduplication**: Scheduled tasks can be submitted with a unique `idempotencyKey` to prevent duplicate submissions from network retries or clients.
* **End-to-End Traceability**: Incorporates trace correlation IDs (`CorrelationIdInterceptor`) injected into all request headers (`x-correlation-id`) and logged into execution histories (`TaskRun`).
* **Interactive Frontend Dashboard**: Features a modern **React + Vite + Tailwind CSS** dashboard to inspect scheduling schedules, live run logs, execution statuses, and trigger actions.
* **Built-in Swagger Docs**: Auto-generated OpenAPI Swagger documentation available at `/api/docs`.
* **Bruno API Collection**: Includes a fully configured Bruno API testing suite under the `/bruno` folder.

---

## 📂 Codebase Layout

```bash
├── prisma/                    # Prisma database schemas, migrations, and customized module
├── src/
│   ├── common/                # Shared filters, interceptors, and types (Correlation IDs, standard error handler)
│   └── schedules/             # Core task engine, DB claimant repository, cron tick scheduler, and task executors
├── frontend/                  # React + Vite dashboard frontend (Tailwind & shadcn/ui components)
├── bruno/                     # Bruno API collection files for manual and automated route testing
└── docker-compose.yml         # Multi-container orchestration (Postgres, Redis, NestJS backend, Frontend)
```

---

## 🛠️ High-Level Architecture

1. **Global Request Lifecycle**:
   * **Correlation Interceptor** (`src/common/interceptors/correlation-id.interceptor.ts`): Injects a unique `correlationId` into the request context and appends it to response headers.
   * **Global Exception Filter** (`src/common/filters/global-exception.filter.ts`): Catches all unhandled exceptions, logs them alongside their corresponding correlation ID, and returns a standardized JSON error envelope.
2. **Core Scheduler Engine**:
   * **Polling Tick** (`src/schedules/scheduler/scheduler-scanner.service.ts`): A NestJS `@Cron` job that queries the database every 5 seconds for due tasks (`PENDING` or `RETRYING` tasks where `nextRunAt` or `scheduleAt` $\le$ `now`).
   * **Atomic Claim** (`src/schedules/schedules.repository.ts`): Employs a Prisma `updateMany` statement to atomically claim tasks (transitioning status from `PENDING` / `RETRYING` to `RUNNING`). If the updated rows count is `0`, another runner claimed the task, and the runner safely skips it.
   * **Execution Logging**: Each run records a `TaskRun` entry capturing stdout/stderr, execution results, status, retry counts, and the correlation ID.

---

## 🐳 Quick Start with Docker

Run the entire full-stack application (Postgres, Redis, NestJS Backend, React Frontend, Nginx) with a single command:

```bash
docker compose up --build
```

* **Frontend Dashboard**: [http://localhost](http://localhost) (mapped on port 80)
* **Backend API**: [http://localhost:3000/api](http://localhost:3000/api)
* **Swagger Documentation**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

---

## 💻 Local Development Setup

The project uses **Yarn v4** (`yarn@4.16.0`) as the package manager. Avoid using `npm`.

### 1. Install Dependencies
```bash
yarn install
```

### 2. Database & Client Generation
The Prisma client is configured to output to a custom location: `generated/prisma`. Generate the client and run migrations:
```bash
npx prisma migrate dev
npx prisma generate
```

### 3. Run Backend
```bash
# development mode (with hot-reloading)
yarn start:dev

# production mode
yarn build
yarn start:prod
```

### 4. Run Frontend
Navigate to the frontend folder and start the dev server:
```bash
cd frontend
yarn install
yarn dev
```

---

## 🧪 Testing, Linting & Formatting

### Run Unit Tests
To allow Prisma 7 Client's dynamic Wasm query compiler imports, run the Jest tests with `NODE_OPTIONS=--experimental-vm-modules`:
```bash
NODE_OPTIONS=--experimental-vm-modules yarn test
```

### Run E2E Tests
```bash
NODE_OPTIONS=--experimental-vm-modules yarn test:e2e
```

### Coverage
```bash
NODE_OPTIONS=--experimental-vm-modules yarn test:cov
```

### Code Formatting & Linting
```bash
# Check and auto-fix linting issues
yarn lint

# Format code files with Prettier
yarn format
```

### 💡 Standalone Script Execution
To execute utility or standalone TypeScript scripts within this environment, always use `npx tsx` instead of `ts-node`:
```bash
npx tsx path/to/script.ts
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/schedules` | Create and queue a new scheduled task |
| `POST` | `/api/schedules/push` | Submit task idempotently (expects `idempotencyKey`) |
| `GET` | `/api/schedules` | Retrieve all scheduled tasks & general overview |
| `GET` | `/api/schedules/:id` | Fetch details & log run history of a specific task |
| `PATCH` | `/api/schedules/:id/cancel` | Cancel an active or pending task |

---

## 🛠️ Key Conventions for Extending

* **Adding a New Task Executor**:
  1. Create a class implementing `TaskExecutor` in `src/schedules/executors/`.
  2. Inject your class into `TaskExecutorRegistry` and map it under its respective `TaskType`.
  3. Register the class in the `providers` array in `src/schedules/schedules.module.ts`.
  4. Define validation guidelines for its input payloads in `TaskPayloadValidator`.

---

## 📄 License

This project is licensed under the MIT License.
