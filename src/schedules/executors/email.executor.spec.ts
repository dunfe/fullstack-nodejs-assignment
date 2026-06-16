import { BadRequestException } from '@nestjs/common';
import { EmailExecutor } from './email.executor';

describe('EmailExecutor', () => {
  let executor: EmailExecutor;

  beforeEach(() => {
    executor = new EmailExecutor();
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
    expect(executor.type).toBe('EMAIL');
  });

  it('should throw BadRequestException if payload is invalid', async () => {
    await expect(executor.execute(null)).rejects.toThrow(BadRequestException);
    await expect(executor.execute([])).rejects.toThrow(BadRequestException);
    await expect(executor.execute({})).rejects.toThrow(BadRequestException);

    // Missing subject
    await expect(
      executor.execute({
        to: ['test@example.com'],
        body: 'Hello',
      }),
    ).rejects.toThrow(BadRequestException);

    // Empty to array
    await expect(
      executor.execute({
        to: [],
        subject: 'Hi',
        body: 'Hello',
      }),
    ).rejects.toThrow(BadRequestException);

    // Invalid email in to array
    await expect(
      executor.execute({
        to: [''],
        subject: 'Hi',
        body: 'Hello',
      }),
    ).rejects.toThrow(BadRequestException);

    // Invalid subject type
    await expect(
      executor.execute({
        to: ['test@example.com'],
        subject: 123,
        body: 'Hello',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should send email successfully with mock json transport', async () => {
    const payload = {
      to: ['recipient1@example.com', 'recipient2@example.com'],
      subject: 'Test Subject',
      body: 'Test Body Content',
    };

    const result = await executor.execute(payload);

    expect(result).toBeDefined();
    expect(result.to).toEqual(payload.to);
    expect(result.subject).toBe(payload.subject);
    expect(result.messageId).toBeDefined();
    expect(result.sentAt).toBeDefined();
    expect(result.envelope).toBeDefined();
    expect(result.envelope.to).toEqual(payload.to);
  });

  it('should propagate sendMail error when delivery fails', async () => {
    // Force transporter.sendMail to fail
    const mockError = new Error('SMTP connection timed out');
    const executorWithTransporter = executor as unknown as {
      transporter: { sendMail: () => Promise<unknown> };
    };
    jest
      .spyOn(executorWithTransporter.transporter, 'sendMail')
      .mockRejectedValueOnce(mockError);

    const payload = {
      to: ['recipient@example.com'],
      subject: 'Failed Email',
      body: 'Content',
    };

    await expect(executor.execute(payload)).rejects.toThrow(
      'Email delivery failed: SMTP connection timed out',
    );
  });
});
