
import type {Context} from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiResponse } from 'shared/dist';

export function success<T> (c:Context,data:T,message='Success',status: ContentfulStatusCode = 200) {
  const response:ApiResponse<T> = {
    success: true,
    status,
    message,
    data,
  };
  
    return c.json (response,status);
}

export function error(c: Context, message: string, status: ContentfulStatusCode = 500, code?: string) {
  const response:ApiResponse<undefined> = {
    success: false,
    status,
    message,
    error: code,
  };
  return c.json(response,status);
}