import { NextFunction, Request, Response } from 'express';

import { Injector } from 'depinj-js';

/**
 * Type that represents a regular express handler.
 */
export type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Type that represents an express error handler.
 */
export type ErrorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Defines the express supported handler types.
 */
export type HandlerTypes = Handler | ErrorHandler;

/**
 * Helper interface to represent a type that has a method that does the handle behavior but that instead
 * of just using a simple function, it needs to be a type that can be resolved.
 */
export interface InjectableHandler<T extends HandlerTypes> {
  handle: T;
}

/**
 * Integration with express. This will bind a middleware with a specific injector. This way, whenever
 * a new request is created, the Injector will bind a scope with it. This way we can inject dependencies
 * into an express middleware. However the middleware must either have a handle method or must be a high order
 * function that returns a handler.
 *
 * If the context already has a scope bound to it, the same scope will be used.
 *
 * @param injector - The injector instance to bind to this middleware injector.
 * @param middlewareName - The Middleware name to which it is registered.
 *
 * @returns An express handler (middleware) that contains the injected middleware.
 */
export function toInjectedHandler<TContext>(
  injector: Injector<TContext>,
  middlewareName: string
): Handler {
  async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Create the scope for the specific request.
    const instantiatedHandler = getHandler<TContext, Handler>(injector, middlewareName, req, res);

    await instantiatedHandler(req, res, next);
  }

  return handler;
}

/**
 * Integration with express. This will bind an error middleware with a specific injector. This way, whenever
 * a new request is created, the Injector will bind a scope with it. This way we can inject dependencies
 * into an express middleware. However the middleware must either have a handle method or must be a high order
 * function that returns a handler.
 *
 * If the context already has a scope bound to it, the same scope will be used.
 *
 * @param injector - The injector instance to bind to this middleware injector.
 * @param middlewareName - The Error Middleware name to which it is registered.
 *
 * @returns An express handler (middleware) that contains the injected middleware.
 */
export function toInjectedErrorHandler<TContext>(
  injector: Injector<TContext>,
  middlewareName: string
): ErrorHandler {
  async function handler(err: Error, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Create the scope for the specific request.
    const instantiatedHandler = getHandler<TContext, ErrorHandler>(injector, middlewareName, req, res);

    await instantiatedHandler(err, req, res, next);
  }

  return handler;
}

/**
 * Auxiliary function that does the binds the new request scope to the injector if possible and
 * obtains the instance of the middleware to run.
 *
 * @param injector - The injector to obtain the instances from.
 * @param middlewareName - The middleware's name to obtain.
 * @param request - The request to bind the scope to.
 * @param response - The response to bind the scope end method to.
 *
 * @returns A valid handler if possible. Otherwise it throws an exception.
 */
function getHandler<TContext, THandler extends HandlerTypes>(
  injector: Injector<TContext>,
  middlewareName: string,
  request: Request,
  response: Response
): THandler {
  // Create the scope for the specific request.
  const scoped = injector.createScope(request);

  // Bind the scope end behavior to the finish event on response.
  response.on('finish', scoped.endScope.bind(scoped));

  // Get the middleware to execute
  const scopedHandler = scoped.getService(middlewareName) as InjectableHandler<THandler> | THandler;

  // Call the handle method, the handler now has the scoped dependencies.
  if (typeof scopedHandler === 'function') {
    return scopedHandler;
  }
  if (typeof scopedHandler.handle === 'function') {
    return scopedHandler.handle.bind(scopedHandler) as THandler;
  }

  // Unsupported handler type
  throw new Error(
    `The instance registered to "${middlewareName}" is not a valid middleware. It must either be a handler function or contain a handle method.`
  );
}
