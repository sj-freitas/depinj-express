import { NextFunction, Request, Response } from 'express';
import { Injector, Builder, ScopeType } from 'depinj-js';

import { toInjectedErrorHandler, toInjectedHandler } from './injected-handler';

describe('injected-handler', () => {
  interface Logger {
    debug: (message: string) => void;
    error: (error: Error, message: string) => void;
  }

  describe('toInjectedHandler', () => {
    class LoggingMiddleware {
      private logger: Logger;
    
      constructor(logger: Logger) {
        this.logger = logger;
      }
    
      public async handle(_: Request, __: Response, next: NextFunction) {
        this.logger.debug('debug message');
    
        next();
      }
    }

    it('adds dependency', async () => {
      // Arrange
      const loggerMock: Logger = {
        debug: jest.fn(),
        error: jest.fn(),
      };
      const registry = new Builder()
        .add('Logger', () => loggerMock)
        .addType('LoggingMiddleware', LoggingMiddleware, ['Logger'])
        .build();
      const mockRespose: Response = ({
        on: jest.fn(),
      } as any) as Response;

      // Act
      const injector = new Injector(registry);
      const handler = toInjectedHandler(injector, 'LoggingMiddleware');

      // Assert
      expect(loggerMock.debug).not.toHaveBeenCalled();
      await handler({} as Request, mockRespose, () => {});
      expect(loggerMock.debug).toHaveBeenCalledWith('debug message');
    });
  });

  describe('toInjectedErrorHandler', () => {
    class ErrorLoggingMiddleware {
      private logger: Logger;
    
      constructor(logger: Logger) {
        this.logger = logger;
      }
    
      public async handle(error: Error, _: Request, __: Response, next: NextFunction) {
        this.logger.error(error, 'error message');
    
        next();
      }
    }

    it('runs the handler', async () => {
      // Arrange
      const loggerMock: Logger = {
        debug: jest.fn(),
        error: jest.fn(),
      };
      const registry = new Builder()
        .add('Logger', () => loggerMock)
        .addType('ErrorLoggingMiddleware', ErrorLoggingMiddleware, ['Logger'])
        .build();
      const mockRespose: Response = ({
        on: jest.fn(),
      } as any) as Response;
      const error = new Error('err');

      // Act
      const injector = new Injector(registry);
      const handler = toInjectedErrorHandler(injector, 'ErrorLoggingMiddleware');

      // Assert
      expect(loggerMock.error).not.toHaveBeenCalled();
      await handler(error, {} as Request, mockRespose, () => {});
      expect(loggerMock.error).toHaveBeenCalledWith(error, 'error message');
    });
  });

  describe('scoped', () => {
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

      const injector = new Injector(registry);

      // Simulate two web requests
      const request1: Request = {} as Request;
      const request2: Request = {} as Request;
      const handler1 = toInjectedHandler(injector, 'IncrementingMiddleware');
      const handler2 = toInjectedHandler(injector, 'IncrementingMiddleware');

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

      const injector = new Injector(registry);
      const handler = toInjectedHandler(injector, 'IncrementingMiddleware');

      // Act
      handler(request, mockRespose, () => {});

      finishResponse();

      // Assert
      expect(onCounterScopeEnd).toHaveBeenCalledTimes(1);
    })
  });
});
