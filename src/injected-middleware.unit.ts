import { NextFunction, Request, response, Response } from 'express';
import { Injector, Builder, ScopeType } from 'depinj-js';

import { toInjectedMiddleware } from './injected-middleware';

class Counter {
  private track: number;

  constructor(initialState: number = 0) {
    this.track = initialState;
  }

  public increment(): void {
    this.track++;
  }

  public getValue(): number {
    return this.track;
  }
}

class Logger<TContext> {
  private context: TContext;

  constructor(context: TContext) {
    this.context = context;
  }

  public debug(message: string) {
    global.console.log(`${JSON.stringify(this.context, null, 2)} -> ${message}`);
  }
}

class LoggingMiddleware {
  private logger: Logger<any>;

  constructor(logger: Logger<any>) {
    this.logger = logger;
  }

  public async handle(req: Request, res: Response, next: NextFunction) {
    this.logger.debug('doStuff');

    next();
  }

  public static dependencies = ['Logger'];
}

class IncrementingMiddleware {
  private counter: Counter;

  constructor(counter: Counter) {
    this.counter = counter;
  }

  public async handle(req: Request, res: Response, next: NextFunction) {
    this.counter.increment();

    next();
  }
}

describe('toInjectedMiddleware', () => {
  describe('middleware', () => {
    it('adds dependency', () => {
      // Arrange
      const registry = new Builder()
        .add('Logger', (ctx) => new Logger(ctx))
        .addType('LoggingMiddleware', LoggingMiddleware)
        .build();

      // Act
      const injector = new Injector({ stuff: 'banana' }, registry);
      const handler = toInjectedMiddleware(injector, LoggingMiddleware);

      // Assert
      handler({} as Request, {} as Response, () => {});
    });
  });

  describe('scoped', () => {
    it('Creates different instances for different contexts', () => {
      // Arrange
      // Simple configuration of a Counter service and a Middleware that uses it.
      const mockRespose: Response = ({
        on: jest.fn(),
      } as any) as Response;
      const registry = new Builder()
        .addType('Counter', Counter, [], ScopeType.Transient)
        .addType('IncrementingMiddleware', IncrementingMiddleware, ['Counter'], ScopeType.OnDemand)
        .build();

      const injector = new Injector({}, registry);

      // Simulate two web requests
      const request1: Request = {} as Request;
      const request2: Request = {} as Request;
      const handler1 = toInjectedMiddleware(injector, IncrementingMiddleware);
      const handler2 = toInjectedMiddleware(injector, IncrementingMiddleware);

      handler1(request1, mockRespose, () => {});
      handler2(request1, mockRespose, () => {});

      // Act
      const counterInstance1 = injector.createScope(request1).getService<Counter>('Counter');
      const counterInstance2 = injector.createScope(request2).getService<Counter>('Counter');
      const counterInstance3 = injector.createScope(request2).getService<Counter>('Counter');

      // Assert
      expect(handler1).not.toBe(handler2);
      expect(counterInstance1).not.toBe(counterInstance2);
      expect(counterInstance2).toBe(counterInstance3);
      expect(counterInstance1.getValue()).toBe(2);
      expect(counterInstance2.getValue()).toBe(0);
    });

    it('calls onScopeEnd when the response is finished', () => {
      // Arrange
      const events: (() => void)[] = [];
      const request: Request = {} as Request;
      const mockRespose: Response = ({
        on: jest.fn((name, callback) => {
          if (name === 'finish') {
            events.push(callback);
          }
        })
      } as any) as Response;

      const finishResponse = () => {
        for (const currFinishEvent of events) {
          currFinishEvent();
        }
      }

      const onCounterScopeEnd = jest.fn();
      const registry = new Builder()
        .addType('Counter', Counter, [], ScopeType.Transient, onCounterScopeEnd)
        .addType('IncrementingMiddleware', IncrementingMiddleware, ['Counter'], ScopeType.OnDemand)
        .build();

      const injector = new Injector({}, registry);
      const handler = toInjectedMiddleware(injector, IncrementingMiddleware);

      // Act
      handler(request, mockRespose, () => {});

      finishResponse();

      // Assert
      expect(onCounterScopeEnd).toHaveBeenCalledTimes(1);
    })
  });
});
