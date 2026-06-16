import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Calendar,
  RefreshCw,
  Plus,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Ban,
  FileText,
  Import,
  FormInput,
  Mail,
  Settings,
  Key,
  ShieldCheck,
  Activity,
  History,
} from 'lucide-react';
import { api } from './services/api';
import type { ScheduleTask, TaskType, TaskStatus, ScheduleKind } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

function App() {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Selected task detail
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [selectedTaskLoading, setSelectedTaskLoading] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPushOpen, setIsPushOpen] = useState(false);

  // Auto refresh
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Form states
  const [taskType, setTaskType] = useState<TaskType>('FILE_READ');
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [timeoutMs, setTimeoutMs] = useState<number>(30000);
  const [retryDelaySeconds, setRetryDelaySeconds] = useState<number>(30);

  // Schedule-specific fields
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('ONCE');
  const [scheduleAt, setScheduleAt] = useState<string>('');
  const [cronExpr, setCronExpr] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Payload fields
  const [filePath, setPath] = useState('package.json');
  const [importPaths, setImportPaths] = useState<string[]>([
    'data/import-1.csv',
  ]);
  const [formTemplate, setFormTemplate] = useState(
    '{\n  "formId": "feedback-form-2026"\n}',
  );
  const [formData, setFormData] = useState(
    '{\n  "customerName": "John Doe",\n  "rating": 5,\n  "comments": "Excellent scheduling software!"\n}',
  );
  const [emailTo, setEmailTo] = useState<string[]>(['admin@example.com']);
  const [emailSubject, setEmailSubject] = useState('Scheduler Task Alert');
  const [emailBody, setEmailBody] = useState(
    'A scheduled task execution run was completed.',
  );

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch all tasks
  const loadTasks = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await api.fetchTasks();
      setTasks(data);
      setBackendHealthy(true);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setBackendHealthy(false);
      setError(err.message || 'Failed to connect to the backend API.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Poll for tasks
  useEffect(() => {
    loadTasks(true);
  }, [loadTasks]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadTasks(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadTasks]);

  // Fetch single task details (including runs)
  const viewTaskDetails = async (id: string) => {
    setSelectedTaskLoading(true);
    setIsDetailOpen(true);
    try {
      const taskDetails = await api.fetchTaskById(id);
      setSelectedTask(taskDetails);
    } catch (err: any) {
      console.error(err);
      alert(`Error loading details: ${err.message}`);
      setIsDetailOpen(false);
    } finally {
      setSelectedTaskLoading(false);
    }
  };

  // Keep details updated if open
  useEffect(() => {
    if (!isDetailOpen || !selectedTask) return;
    const interval = setInterval(async () => {
      try {
        const taskDetails = await api.fetchTaskById(selectedTask.id);
        setSelectedTask(taskDetails);
      } catch (err) {
        console.error('Failed to auto-refresh task detail:', err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isDetailOpen, selectedTask?.id]);

  // Cancel task
  const cancelTask = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled task?'))
      return;
    try {
      await api.cancelTask(id);
      await loadTasks(false);
      if (selectedTask && selectedTask.id === id) {
        const taskDetails = await api.fetchTaskById(id);
        setSelectedTask(taskDetails);
      }
    } catch (err: any) {
      alert(`Failed to cancel task: ${err.message}`);
    }
  };

  // Helper to generate UUID-like key
  const generateIdempotencyKey = () => {
    const key =
      'idem-' +
      Math.random().toString(36).substring(2, 15) +
      '-' +
      Math.random().toString(36).substring(2, 15);
    setIdempotencyKey(key);
  };

  // Form payload constructor based on type
  const buildPayload = (): Record<string, any> => {
    switch (taskType) {
      case 'FILE_READ':
        return { path: filePath };
      case 'FILE_IMPORT':
        return { paths: importPaths.filter((p) => p.trim() !== '') };
      case 'FORM_FILL':
        try {
          return {
            template: JSON.parse(formTemplate),
            data: JSON.parse(formData),
          };
        } catch (e) {
          throw new Error('Invalid JSON format in template or data.');
        }
      case 'EMAIL':
        return {
          to: emailTo.filter((e) => e.trim() !== ''),
          subject: emailSubject,
          body: emailBody,
        };
    }
  };

  // Handle Push Instant Task submission
  const handlePushSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);

    try {
      const payload = buildPayload();

      const pushDto: any = {
        type: taskType,
        payload,
        idempotencyKey: idempotencyKey || undefined,
        maxRetries,
        timeoutMs,
        retryDelaySeconds,
      };

      if (scheduleKind === 'ONCE') {
        if (scheduleAt) {
          const scheduleDate = new Date(scheduleAt);
          if (scheduleDate.getTime() <= Date.now()) {
            throw new Error('Schedule Date must be in the future.');
          }
          pushDto.scheduleAt = scheduleDate.toISOString();
        } else {
          // Push immediately (or near-immediately by scheduling a few seconds out or leaving it to default if NestJS allows)
          // The CreateScheduleDto / PushScheduleDto requires either scheduleAt or cronExpr.
          // Let's set scheduleAt to 5 seconds in the future for "instant" push
          const defaultDate = new Date(Date.now() + 5000);
          pushDto.scheduleAt = defaultDate.toISOString();
        }
      } else {
        if (!cronExpr) throw new Error('Cron expression is required.');
        pushDto.cronExpr = cronExpr;
      }

      if (!idempotencyKey) {
        throw new Error('Idempotency key is required for pushed tasks.');
      }

      await api.pushSchedule(pushDto);
      setIsPushOpen(false);
      loadTasks(true);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'An error occurred during submission.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Create Scheduled Task submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);

    try {
      const payload = buildPayload();

      const createDto: any = {
        type: taskType,
        payload,
        idempotencyKey: idempotencyKey || undefined,
        maxRetries,
        timeoutMs,
        retryDelaySeconds,
      };

      if (scheduleKind === 'ONCE') {
        if (!scheduleAt)
          throw new Error('Schedule date is required for one-time tasks.');
        const scheduleDate = new Date(scheduleAt);
        if (scheduleDate.getTime() <= Date.now()) {
          throw new Error('Schedule Date must be in the future.');
        }
        createDto.scheduleAt = scheduleDate.toISOString();
      } else {
        if (!cronExpr) throw new Error('Cron expression is required.');
        createDto.cronExpr = cronExpr;
      }

      await api.createSchedule(createDto);
      setIsCreateOpen(false);
      loadTasks(true);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'An error occurred during submission.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Reset forms
  const resetFormDefaults = (type: TaskType) => {
    setTaskType(type);
    setFormError(null);
    setMaxRetries(3);
    setTimeoutMs(30000);
    setRetryDelaySeconds(30);
    setScheduleKind('ONCE');
    setScheduleAt('');
    setCronExpr('');
    setIdempotencyKey('');
  };

  // Icon maps for Task Types
  const getTaskIcon = (type: TaskType) => {
    switch (type) {
      case 'FILE_READ':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'FILE_IMPORT':
        return <Import className="h-4 w-4 text-purple-500" />;
      case 'FORM_FILL':
        return <FormInput className="h-4 w-4 text-emerald-500" />;
      case 'EMAIL':
        return <Mail className="h-4 w-4 text-amber-500" />;
    }
  };

  // Status Badge configurations
  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent hover:bg-emerald-500/20">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Success
          </Badge>
        );
      case 'RUNNING':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent animate-pulse hover:bg-amber-500/20">
            <Clock className="mr-1 h-3 w-3 animate-spin" /> Running
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent hover:bg-blue-500/20">
            <Clock className="mr-1 h-3 w-3" /> Pending
          </Badge>
        );
      case 'RETRYING':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent hover:bg-amber-500/20">
            <AlertCircle className="mr-1 h-3 w-3" /> Retrying
          </Badge>
        );
      case 'CANCELED':
        return (
          <Badge className="bg-slate-500/15 text-slate-700 dark:text-slate-400 border-transparent hover:bg-slate-500/20">
            <Ban className="mr-1 h-3 w-3" /> Canceled
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Count helper functions
  const countStats = () => {
    const stats = {
      total: tasks.length,
      running: tasks.filter(
        (t) => t.status === 'RUNNING' || t.status === 'RETRYING',
      ).length,
      success: tasks.filter((t) => t.status === 'SUCCESS').length,
      failed: tasks.filter((t) => t.status === 'FAILED').length,
    };
    return stats;
  };

  const stats = countStats();

  // Filter logic
  const filteredTasks = tasks.filter((task) => {
    const statusMatch = filterStatus === 'ALL' || task.status === filterStatus;
    const typeMatch = filterType === 'ALL' || task.type === filterType;
    return statusMatch && typeMatch;
  });

  return (
    <div className="min-height-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex flex-col gap-6 w-full max-w-7xl mx-auto border-none">
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary animate-pulse" />
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 m-0 leading-none">
              Schedule Task Runner
            </h1>
          </div>
          <p className="text-muted-foreground mt-2">
            A distributed database-driven schedule task executor and polling
            dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Health indicator */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border rounded-full px-3 py-1 text-sm shadow-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${backendHealthy === true ? 'bg-emerald-500' : backendHealthy === false ? 'bg-rose-500' : 'bg-amber-400'}`}
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              API Status:{' '}
              {backendHealthy === true
                ? 'Online'
                : backendHealthy === false
                  ? 'Offline'
                  : 'Checking...'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border rounded-md p-1 shadow-sm">
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="h-8"
            >
              {autoRefresh ? 'Auto Sync: On' : 'Auto Sync: Off'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadTasks(true)}
              disabled={loading}
              className="h-8"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>
      </header>

      {/* METRICS CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Tasks
            </CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Configured task definitions
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Succeeded
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.success}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Completed successfully
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Running / Retrying
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500 animate-spin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats.running}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently being processed
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Failed Runs
            </CardTitle>
            <XCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {stats.failed}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Exceeded maximum retries
            </p>
          </CardContent>
        </Card>
      </section>

      {/* CONTROLS AND TASK TABLE */}
      <section className="flex flex-col gap-4 bg-white dark:bg-slate-900 rounded-xl border p-4 md:p-6 shadow-sm">
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-400 p-3 rounded-lg border border-rose-200 text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Type:</span>
              <Select
                value={filterType}
                onValueChange={(value) => setFilterType(value)}
              >
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="FILE_READ">FILE_READ</SelectItem>
                  <SelectItem value="FILE_IMPORT">FILE_IMPORT</SelectItem>
                  <SelectItem value="FORM_FILL">FORM_FILL</SelectItem>
                  <SelectItem value="EMAIL">EMAIL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Select
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value)}
              >
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PENDING">PENDING</SelectItem>
                  <SelectItem value="RUNNING">RUNNING</SelectItem>
                  <SelectItem value="SUCCESS">SUCCESS</SelectItem>
                  <SelectItem value="FAILED">FAILED</SelectItem>
                  <SelectItem value="RETRYING">RETRYING</SelectItem>
                  <SelectItem value="CANCELED">CANCELED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetFormDefaults('FILE_READ');
                generateIdempotencyKey();
                setIsPushOpen(true);
              }}
              className="gap-1.5 h-9"
            >
              <Play className="h-4 w-4" />
              Push Instant Task
            </Button>

            <Button
              size="sm"
              onClick={() => {
                resetFormDefaults('FILE_READ');
                setIsCreateOpen(true);
              }}
              className="gap-1.5 h-9"
            >
              <Plus className="h-4 w-4" />
              Create Schedule Task
            </Button>
          </div>
        </div>

        {/* TASK TABLE */}
        <div className="border rounded-lg mt-2 overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <ShieldCheck className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
                No Scheduled Tasks
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                No tasks match your selected filters. Create a new schedule task
                or push an instant task to start!
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                    Task Details
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                    Schedule Mode
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                    Attempts / Retries
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                    Next Scheduled Run
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">
                    Created At
                  </TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-300">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => {
                  const isCancelable =
                    (task.scheduleKind === 'CRON' &&
                      task.status !== 'CANCELED') ||
                    (task.status !== 'SUCCESS' &&
                      task.status !== 'FAILED' &&
                      task.status !== 'CANCELED');
                  return (
                    <TableRow
                      key={task.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-md">
                            {getTaskIcon(task.type)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              {task.type}
                              {task.idempotencyKey && (
                                <span title="Idempotent">
                                  <Key className="h-3 w-3 text-muted-foreground" />
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground max-w-xs truncate font-mono">
                              ID: {task.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold uppercase text-slate-500">
                            {task.scheduleKind === 'CRON'
                              ? 'Cron / Recurring'
                              : 'One-Time'}
                          </span>
                          <span className="text-sm font-medium font-mono text-slate-700 dark:text-slate-300">
                            {task.cronExpr ? task.cronExpr : 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(task.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold">
                            {task.attemptCount}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground">
                            {task.maxRetries}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                            {task.nextRunAt
                              ? new Date(task.nextRunAt).toLocaleString()
                              : 'N/A'}
                          </span>
                          {task.lastRunAt && (
                            <span className="text-[10px] text-muted-foreground">
                              Last: {new Date(task.lastRunAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {new Date(task.createdAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                            onClick={() => viewTaskDetails(task.id)}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {isCancelable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              onClick={() => cancelTask(task.id)}
                              title="Cancel Task"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* DETAIL MODAL */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-4xl overflow-y-auto max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Task Execution History &amp; Logs
            </DialogTitle>
            <DialogDescription>
              Details, input payload, output result, and execution attempts log.
            </DialogDescription>
          </DialogHeader>

          {selectedTaskLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Loading execution records...
              </p>
            </div>
          ) : selectedTask ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {/* LEFT COLUMN: TASK DETAILS */}
              <div className="flex flex-col gap-4 border-r pr-0 md:pr-6">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Task Metadata
                  </h4>
                  <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-lg border text-sm flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Task ID:</span>
                      <span className="font-mono font-medium">
                        {selectedTask.id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Task Type:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedTask.type}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <span>{getStatusBadge(selectedTask.status)}</span>
                    </div>
                    {selectedTask.idempotencyKey && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Idempotency Key:
                        </span>
                        <span className="font-mono text-xs max-w-[200px] truncate">
                          {selectedTask.idempotencyKey}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Config:</span>
                      <span>
                        Retries: {selectedTask.maxRetries} | Timeout:{' '}
                        {selectedTask.timeoutMs / 1000}s
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                    Input Payload
                    <span className="text-[10px] lowercase text-muted-foreground font-normal">
                      JSON object
                    </span>
                  </h4>
                  <pre className="bg-slate-900 dark:bg-black text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono max-h-48 border">
                    {JSON.stringify(selectedTask.payload, null, 2)}
                  </pre>
                </div>

                {selectedTask.result && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                      Execution Output (Result)
                    </h4>
                    <pre className="bg-emerald-950/20 dark:bg-emerald-950/10 text-emerald-800 dark:text-emerald-400 p-4 rounded-lg text-xs overflow-x-auto font-mono max-h-48 border border-emerald-500/20">
                      {JSON.stringify(selectedTask.result, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedTask.lastError && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-500 mb-2 flex items-center justify-between">
                      Last Execution Error
                    </h4>
                    <div className="bg-rose-50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-400 p-4 rounded-lg text-xs font-mono border border-rose-200">
                      {selectedTask.lastError}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: EXECUTION LOGS (RUNS) */}
              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Attempts History ({selectedTask.runs?.length || 0})
                </h4>

                {!selectedTask.runs || selectedTask.runs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-xs">No execution runs recorded yet.</p>
                    <p className="text-[10px] mt-1">
                      This task is waiting for its scheduled time to be claimed
                      by a runner.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 overflow-y-auto max-h-[450px] pr-1">
                    {selectedTask.runs.map((run) => {
                      const durationMs =
                        run.startedAt && run.finishedAt
                          ? new Date(run.finishedAt).getTime() -
                            new Date(run.startedAt).getTime()
                          : null;
                      return (
                        <div
                          key={run.id}
                          className="border rounded-lg p-3 flex flex-col gap-2 bg-slate-50 dark:bg-slate-900 text-xs shadow-xs"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Attempt #{run.attemptNumber}
                            </span>
                            {getStatusBadge(run.status)}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground border-y py-1.5 my-1 bg-white/50 dark:bg-black/25 px-1.5 rounded">
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold">
                                Started
                              </span>
                              {run.startedAt
                                ? new Date(run.startedAt).toLocaleString()
                                : 'N/A'}
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider font-semibold">
                                Finished (Duration)
                              </span>
                              {run.finishedAt
                                ? `${new Date(run.finishedAt).toLocaleTimeString()} (${durationMs !== null ? `${durationMs}ms` : 'N/A'})`
                                : 'N/A'}
                            </div>
                            <div className="col-span-2">
                              <span className="block text-[8px] uppercase tracking-wider font-semibold">
                                Correlation ID / Trace
                              </span>
                              <span className="font-mono">
                                {run.correlationId}
                              </span>
                            </div>
                          </div>

                          {run.errorMessage && (
                            <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 p-2 rounded border border-rose-500/20 font-mono text-[10px]">
                              <strong>Error:</strong> {run.errorMessage}
                            </div>
                          )}

                          {run.result && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[10px] text-primary hover:underline font-medium select-none">
                                View Run Output Details
                              </summary>
                              <pre className="bg-slate-900 dark:bg-black text-slate-100 p-2 rounded text-[10px] font-mono mt-1.5 overflow-x-auto max-h-32 border">
                                {JSON.stringify(run.result, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Close History
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE SCHEDULE TASK DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto max-h-[85vh]">
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-1.5">
                <Calendar className="h-5 w-5 text-primary" />
                Create New Schedule Task
              </DialogTitle>
              <DialogDescription>
                Define a cron expression or specific future date to register a
                schedule.
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="bg-rose-50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-400 p-3 rounded-lg border border-rose-200 text-sm font-medium">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Form: General settings */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Task Executor Type
                  </label>
                  <Select
                    value={taskType}
                    onValueChange={(value) =>
                      resetFormDefaults(value as TaskType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select executor type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FILE_READ">
                        FILE_READ - Read local server file
                      </SelectItem>
                      <SelectItem value="FILE_IMPORT">
                        FILE_IMPORT - Import multiple data files
                      </SelectItem>
                      <SelectItem value="FORM_FILL">
                        FORM_FILL - Automated data template filler
                      </SelectItem>
                      <SelectItem value="EMAIL">
                        EMAIL - Send mail notification
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Schedule Kind
                  </label>
                  <Select
                    value={scheduleKind}
                    onValueChange={(value) =>
                      setScheduleKind(value as ScheduleKind)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select schedule kind" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ONCE">
                        Once (At specific date/time)
                      </SelectItem>
                      <SelectItem value="CRON">
                        Cron (Recurring schedule)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {scheduleKind === 'ONCE' ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Schedule At (ISO8601 Future Date)
                    </label>
                    <Input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e: any) => setScheduleAt(e.target.value)}
                      required={scheduleKind === 'ONCE'}
                    />
                    <span className="text-[10px] text-muted-foreground block">
                      Must be a valid date/time in the future.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Cron Expression
                    </label>
                    <Input
                      placeholder="e.g. */10 * * * * * (Every 10 seconds)"
                      value={cronExpr}
                      onChange={(e: any) => setCronExpr(e.target.value)}
                      required={scheduleKind === 'CRON'}
                    />
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setCronExpr('*/5 * * * * *')}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded border"
                      >
                        Every 5s
                      </button>
                      <button
                        type="button"
                        onClick={() => setCronExpr('0 * * * * *')}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded border"
                      >
                        Every Min
                      </button>
                      <button
                        type="button"
                        onClick={() => setCronExpr('0 0 * * * *')}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded border"
                      >
                        Every Hr
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    Idempotency Key
                    <button
                      type="button"
                      onClick={generateIdempotencyKey}
                      className="text-[10px] text-primary hover:underline font-medium"
                    >
                      Generate Unique
                    </button>
                  </label>
                  <Input
                    placeholder="Optional unique submission key"
                    value={idempotencyKey}
                    onChange={(e: any) => setIdempotencyKey(e.target.value)}
                  />
                </div>
              </div>

              {/* Right Form: Payload & Advanced Parameters */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Executor Payload Configuration
                  </h4>
                </div>

                {/* DYNAMIC PAYLOAD FIELDS */}
                {taskType === 'FILE_READ' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      File Path
                    </label>
                    <Input
                      value={filePath}
                      onChange={(e: any) => setPath(e.target.value)}
                      placeholder="e.g. package.json"
                      required
                    />
                    <span className="text-[10px] text-muted-foreground block">
                      Target file path relative to NestJS backend root.
                    </span>
                  </div>
                )}

                {taskType === 'FILE_IMPORT' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Paths (Comma-separated)
                    </label>
                    <Input
                      value={importPaths.join(', ')}
                      onChange={(e: any) =>
                        setImportPaths(
                          e.target.value.split(',').map((s: any) => s.trim()),
                        )
                      }
                      placeholder="e.g. data/file1.csv, data/file2.csv"
                      required
                    />
                    <span className="text-[10px] text-muted-foreground block">
                      Input paths formatted as a JSON array of strings in
                      payload.
                    </span>
                  </div>
                )}

                {taskType === 'FORM_FILL' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Form Template (JSON)
                      </label>
                      <textarea
                        value={formTemplate}
                        onChange={(e: any) => setFormTemplate(e.target.value)}
                        className="w-full h-24 border rounded-md p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Form Data (JSON)
                      </label>
                      <textarea
                        value={formData}
                        onChange={(e: any) => setFormData(e.target.value)}
                        className="w-full h-24 border rounded-md p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        required
                      />
                    </div>
                  </div>
                )}

                {taskType === 'EMAIL' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Recipients (Comma-separated)
                      </label>
                      <Input
                        value={emailTo.join(', ')}
                        onChange={(e: any) =>
                          setEmailTo(
                            e.target.value.split(',').map((s: any) => s.trim()),
                          )
                        }
                        placeholder="e.g. admin@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Subject
                      </label>
                      <Input
                        value={emailSubject}
                        onChange={(e: any) => setEmailSubject(e.target.value)}
                        placeholder="Subject line"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Email Body
                      </label>
                      <textarea
                        value={emailBody}
                        onChange={(e: any) => setEmailBody(e.target.value)}
                        className="w-full h-16 border rounded-md p-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* ADVANCED ARGS */}
                <div className="grid grid-cols-3 gap-2 border-t pt-3 mt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Max Retries
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={maxRetries}
                      onChange={(e: any) =>
                        setMaxRetries(parseInt(e.target.value) || 0)
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Timeout (ms)
                    </label>
                    <Input
                      type="number"
                      min={1000}
                      max={300000}
                      value={timeoutMs}
                      onChange={(e: any) =>
                        setTimeoutMs(parseInt(e.target.value) || 30000)
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Delay (s)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={retryDelaySeconds}
                      onChange={(e: any) =>
                        setRetryDelaySeconds(parseInt(e.target.value) || 30)
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={formSubmitting}>
                {formSubmitting ? 'Registering...' : 'Register Schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PUSH INSTANT TASK DIALOG */}
      <Dialog open={isPushOpen} onOpenChange={setIsPushOpen}>
        <DialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto max-h-[85vh]">
          <form onSubmit={handlePushSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-1.5">
                <Play className="h-5 w-5 text-primary" />
                Push Instant / Idempotent Task
              </DialogTitle>
              <DialogDescription>
                Pushes a task that executes immediately or using a custom
                scheduled offset. This enforces a strict{' '}
                <strong>idempotency key</strong> to prevent double submission.
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="bg-rose-50 dark:bg-rose-950/15 text-rose-600 dark:text-rose-400 p-3 rounded-lg border border-rose-200 text-sm font-medium">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Form: General settings */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Task Executor Type
                  </label>
                  <Select
                    value={taskType}
                    onValueChange={(value) =>
                      resetFormDefaults(value as TaskType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select executor type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FILE_READ">
                        FILE_READ - Read local server file
                      </SelectItem>
                      <SelectItem value="FILE_IMPORT">
                        FILE_IMPORT - Import multiple data files
                      </SelectItem>
                      <SelectItem value="FORM_FILL">
                        FORM_FILL - Automated data template filler
                      </SelectItem>
                      <SelectItem value="EMAIL">
                        EMAIL - Send mail notification
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    Idempotency Key (Mandatory)
                    <button
                      type="button"
                      onClick={generateIdempotencyKey}
                      className="text-[10px] text-primary hover:underline font-medium"
                    >
                      Regenerate
                    </button>
                  </label>
                  <Input
                    placeholder="Enter unique key"
                    value={idempotencyKey}
                    onChange={(e) => setIdempotencyKey(e.target.value)}
                    required
                  />
                  <span className="text-[10px] text-muted-foreground block">
                    Prevents duplicated runs. If this key is already registered
                    in the DB, the service will return the existing task
                    immediately.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Execution Timing
                  </label>
                  <Select
                    value={scheduleKind}
                    onValueChange={(value) =>
                      setScheduleKind(value as ScheduleKind)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select timing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ONCE">
                        Instant (Within ~5 seconds)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right Form: Payload & Advanced Parameters */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Executor Payload Configuration
                  </h4>
                </div>

                {/* DYNAMIC PAYLOAD FIELDS */}
                {taskType === 'FILE_READ' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      File Path
                    </label>
                    <Input
                      value={filePath}
                      onChange={(e: any) => setPath(e.target.value)}
                      placeholder="e.g. package.json"
                      required
                    />
                    <span className="text-[10px] text-muted-foreground block">
                      Target file path relative to NestJS backend root.
                    </span>
                  </div>
                )}

                {taskType === 'FILE_IMPORT' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Paths (Comma-separated)
                    </label>
                    <Input
                      value={importPaths.join(', ')}
                      onChange={(e: any) =>
                        setImportPaths(
                          e.target.value.split(',').map((s: any) => s.trim()),
                        )
                      }
                      placeholder="e.g. data/file1.csv, data/file2.csv"
                      required
                    />
                  </div>
                )}

                {taskType === 'FORM_FILL' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Form Template (JSON)
                      </label>
                      <textarea
                        value={formTemplate}
                        onChange={(e: any) => setFormTemplate(e.target.value)}
                        className="w-full h-24 border rounded-md p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Form Data (JSON)
                      </label>
                      <textarea
                        value={formData}
                        onChange={(e: any) => setFormData(e.target.value)}
                        className="w-full h-24 border rounded-md p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        required
                      />
                    </div>
                  </div>
                )}

                {taskType === 'EMAIL' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Recipients (Comma-separated)
                      </label>
                      <Input
                        value={emailTo.join(', ')}
                        onChange={(e: any) =>
                          setEmailTo(
                            e.target.value.split(',').map((s: any) => s.trim()),
                          )
                        }
                        placeholder="e.g. admin@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Subject
                      </label>
                      <Input
                        value={emailSubject}
                        onChange={(e: any) => setEmailSubject(e.target.value)}
                        placeholder="Subject line"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Email Body
                      </label>
                      <textarea
                        value={emailBody}
                        onChange={(e: any) => setEmailBody(e.target.value)}
                        className="w-full h-16 border rounded-md p-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* ADVANCED ARGS */}
                <div className="grid grid-cols-3 gap-2 border-t pt-3 mt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Max Retries
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={maxRetries}
                      onChange={(e: any) =>
                        setMaxRetries(parseInt(e.target.value) || 0)
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Timeout (ms)
                    </label>
                    <Input
                      type="number"
                      min={1000}
                      max={300000}
                      value={timeoutMs}
                      onChange={(e: any) =>
                        setTimeoutMs(parseInt(e.target.value) || 30000)
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Delay (s)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={retryDelaySeconds}
                      onChange={(e: any) =>
                        setRetryDelaySeconds(parseInt(e.target.value) || 30)
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPushOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={formSubmitting}>
                {formSubmitting ? 'Pushing...' : 'Push Instant Task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
