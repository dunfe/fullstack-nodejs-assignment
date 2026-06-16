import type { ScheduleTask, CreateScheduleDto, PushScheduleDto } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorDetail;
    try {
      errorDetail = await response.json();
    } catch {
      errorDetail = { message: response.statusText };
    }
    const message = errorDetail?.message || 'An error occurred while fetching data.';
    throw new Error(typeof message === 'object' ? JSON.stringify(message) : message);
  }
  return response.json();
}

export const api = {
  async fetchTasks(): Promise<ScheduleTask[]> {
    const response = await fetch(`${API_BASE_URL}/schedules`);
    return handleResponse<ScheduleTask[]>(response);
  },

  async fetchTaskById(id: string): Promise<ScheduleTask> {
    const response = await fetch(`${API_BASE_URL}/schedules/${id}`);
    return handleResponse<ScheduleTask>(response);
  },

  async createSchedule(dto: CreateScheduleDto): Promise<ScheduleTask> {
    const response = await fetch(`${API_BASE_URL}/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });
    return handleResponse<ScheduleTask>(response);
  },

  async pushSchedule(dto: PushScheduleDto): Promise<ScheduleTask> {
    const response = await fetch(`${API_BASE_URL}/schedules/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });
    return handleResponse<ScheduleTask>(response);
  },

  async cancelTask(id: string): Promise<ScheduleTask> {
    const response = await fetch(`${API_BASE_URL}/schedules/${id}/cancel`, {
      method: 'PATCH',
    });
    return handleResponse<ScheduleTask>(response);
  },
};
