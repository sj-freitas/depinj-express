import { NextFunction, Request, Response } from 'express';

import { Injector } from 'depinj-js';

/**
 * Helper interface to represent a type that has a method that does the handle behavior but that instead
 * of just using a simple function, it needs to be a type that can be resolved.
 */
export interface InjectableMiddleware {
  handle(req: Request, res: Response, next: NextFunction): Promise<void>;
}

/**
 * Integration with express. This will bind a middleware with a specific injector. This way, whenever
 * a new request is created, the Injector will bind a scope with it. This way we can inject dependencies
 * into an express middleware. However the middleware must extend an abstract class to work within this
 * system as it requires a constructor.
 * 
 * If the context already has a scope bound to it, the same scope will be used.
 *
 * @param injector - The injector instance to bind to this middleware injector.
 * @param DependentType - The Middleware to inject. Can either be the type or the name to which it is registered.
 * @returns An express handler (middleware) that contains the injected middleware.
 */
export function toInjectedMiddleware<TContext, TMiddleware extends InjectableMiddleware>(
  injector: Injector<TContext>,
  DependentType: new (...args: any[]) => TMiddleware | string
) {
  async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Create the scope for the specific request.
    const scoped = injector.createScope(req);

    // Bind the scope end behavior to the finish event on response.
    res.on('finish', scoped.endScope.bind(scoped));

    // Get the middleware to execute
    const serviceName = typeof DependentType === 'string' ? DependentType : DependentType.name;
    const scopedHandler = scoped.getService(serviceName) as TMiddleware;

    // Call the handle method, the handler now has the scoped dependencies.
    await scopedHandler.handle(req, res, next);
  }

  return handler;
}
