# Architecture Design Document: Distributed Resilient Task Scheduler

## 1. System Overview
The **Schedule Task Application** is a highly resilient, distributed, database-driven task scheduling and execution engine. Built on **NestJS**, **Prisma ORM**, **PostgreSQL**, and **Redis**, the system is designed to run reliably across multiple scaled-out application instances. It features a separate **React + Vite** frontend dashboard for real-time monitoring and triggering.

```
       +-------------------------------------------------------+
       |                  React Frontend (Vite)                |
       +----------------------------+--------------------------+
                                    | HTTP / REST
                                    v
       +-------------------------------------------------------+
       |                  NestJS Backend Nodes                 |
       |  +--------------------+       +--------------------+  |
       |  |  Scanner Service   |       |  Scanner Service   |  |
       |  +---------+----------+       +---------+----------+  |
       |            |                            |             |
       |  +---------v----------+       +---------v----------+  |
       |  |  Atomic Claim (DB) |       |  Atomic Claim (DB) |  |
       |  +---------+----------+       +---------+----------+  |
       +------------+----------------------------+-------------+
                    |                            |
                    +------------+---------------+
                                 | DB Transaction (Prisma)
                                 v
                     +-----------------------+
                     |  PostgreSQL Database  | <---> [ Redis Cache / Queue ]
                     +-----------------------+
```

---

## 2. Core Architectural Patterns

### A. Distributed Polling & Atomic Claim (Database-Driven Scheduler)
To allow safe horizontal scaling without a heavy external orchestrator, the application employs an **Atomic Claim / CAS (Compare-and-Swap) Pattern** over the database:
1. **Polling Tick**: A NestJS cron job runs every 5 seconds on all nodes to look for tasks due for execution (`nextRunAt` $\le$ `now` and status is `PENDING` or `RETRYING`).
2. **Atomic Claim**: To prevent race conditions where multiple backend instances execute the same due task, nodes execute a Prisma atomic write:
   ```typescript
   prisma.scheduleTask.updateMany({
     where: { id: taskId, status: { in: ['PENDING', 'RETRYING'] } },
     data: { status: 'RUNNING', attemptCount: { increment: 1 } }
   })
   ```
3. **Execution**: If the returned count of updated rows is `1`, that node has successfully locked and claimed the task. If `0`, another node claimed it first, and the current node safely skips it.

### B. Task Executor Strategy Pattern
Executors are designed around the **Strategy Pattern** to ensure high extensibility:
* **Interface**: All task execution classes implement a unified `TaskExecutor` interface with a `run(payload: any)` method.
* **Registry**: A `TaskExecutorRegistry` resolves the concrete executor dynamically based on `TaskType` (`FILE_READ`, `FILE_IMPORT`, `FORM_FILL`, `EMAIL`).
* **Validation**: Every payload undergoes schema-specific validation by a unified `TaskPayloadValidator` before database insertion.

### C. Idempotency & Deduplication
To prevent duplicate tasks from network retries or multiple external system pushes, the `POST /api/schedules/push` endpoint accepts an optional `idempotencyKey`. The service checks for an existing record with the key: if found, it returns the existing task details directly rather than creating a new schedule.

### D. End-to-End Traceability (Correlation IDs)
* **Lifecycle Trace**: Every HTTP request is intercepted by `CorrelationIdInterceptor` to inject a unique `correlationId`. This is attached as `x-correlation-id` in the API response.
* **Log Correlation**: Any execution triggered by the polling mechanism or HTTP endpoints carries this ID. Every task attempt logs a `TaskRun` record with the matching `correlationId`, creating a complete, searchable execution trace.

---

## 3. Data Model

The PostgreSQL schema consists of two highly indexed primary tables:

1. **`ScheduleTask`**: Holds task configurations, execution status, scheduling constraints (one-time `scheduleAt` or recurring `cronExpr`), retries, timeouts, and execution state metadata.
2. **`TaskRun`**: A 1-to-many relationship log table storing detailed records for every attempt of a task run, including stdout/stderr, execution outcomes (`SUCCESS`/`FAILED`), durations, errors, and the tracking `correlationId`.

---

## 4. Resilience, Failure Handling & Retries

* **Auto-Recovery**: If a node crashes mid-execution, a periodic recovery worker detects tasks stuck in the `RUNNING` status beyond their defined `timeoutMs` threshold and transitions them back to `RETRYING` or `FAILED`.
* **Exponential/Delay Retry**: Failed tasks transition to `RETRYING` with `nextRunAt` pushed forward based on `retryDelaySeconds` until `maxRetries` is exhausted, at which point the task is marked as `FAILED`.
