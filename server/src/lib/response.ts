
import type {Context} from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function success<T> (c:Context,data:T,message='Success',status: ContentfulStatusCode = 200) {
    return c.json ({
        success:true,
        message,
        data,
    },status);
}

export function error(c: Context, message: string, status: ContentfulStatusCode = 500, code?: string) {
  return c.json({
    success: false,
    error: {
      message,
      code,
    },
  }, status);
}