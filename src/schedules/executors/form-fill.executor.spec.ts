import { BadRequestException } from '@nestjs/common';
import { FormFillExecutor } from './form-fill.executor';

describe('FormFillExecutor', () => {
  let executor: FormFillExecutor;

  beforeAll(() => {
    executor = new FormFillExecutor();
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
    expect(executor.type).toBe('FORM_FILL');
  });

  it('should throw BadRequestException if payload is invalid', async () => {
    await expect(executor.execute(null)).rejects.toThrow(BadRequestException);
    await expect(executor.execute([])).rejects.toThrow(BadRequestException);
    await expect(executor.execute({})).rejects.toThrow(BadRequestException);
    await expect(
      executor.execute({
        template: 'not-an-object',
        data: {},
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      executor.execute({
        template: {},
        data: 'not-an-object',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should fill simple templates and preserve original type for single placeholders', async () => {
    const payload = {
      template: {
        id: '{{formId}}',
        title: 'Form with score: ${score}',
        meta: {
          active: '{{isActive}}',
          scoreValue: '{{score}}',
          tags: '{{tags}}',
        },
      },
      data: {
        formId: 'feedback-123',
        score: 10,
        isActive: true,
        tags: ['important', 'new'],
      },
    };

    const result = await executor.execute(payload);

    expect(result).toEqual({
      id: 'feedback-123',
      title: 'Form with score: 10',
      meta: {
        active: true,
        scoreValue: 10,
        tags: ['important', 'new'],
      },
    });
  });

  it('should fill nested fields using path syntax', async () => {
    const payload = {
      template: {
        userName: '{{user.profile.name}}',
        greeting: 'Hello, ${user.profile.name}! Your role is {{user.role}}.',
        unresolved: '{{user.profile.age}}',
      },
      data: {
        user: {
          profile: {
            name: 'Alice',
          },
          role: 'Admin',
        },
      },
    };

    const result = await executor.execute(payload);

    expect(result).toEqual({
      userName: 'Alice',
      greeting: 'Hello, Alice! Your role is Admin.',
      unresolved: '',
    });
  });

  it('should recursively fill objects inside arrays', async () => {
    const payload = {
      template: {
        items: [
          {
            name: '{{item1}}',
            price: '{{price1}}',
          },
          {
            name: '{{item2}}',
            price: '{{price2}}',
          },
        ],
      },
      data: {
        item1: 'Laptop',
        price1: 999.99,
        item2: 'Mouse',
        price2: 25,
      },
    };

    const result = await executor.execute(payload);

    expect(result).toEqual({
      items: [
        {
          name: 'Laptop',
          price: 999.99,
        },
        {
          name: 'Mouse',
          price: 25,
        },
      ],
    });
  });

  it('should handle whitespace in placeholders', async () => {
    const payload = {
      template: {
        message: 'Hello {{   name   }}! Please contact ${   email   }.',
      },
      data: {
        name: 'Bob',
        email: 'bob@example.com',
      },
    };

    const result = await executor.execute(payload);

    expect(result).toEqual({
      message: 'Hello Bob! Please contact bob@example.com.',
    });
  });
});
