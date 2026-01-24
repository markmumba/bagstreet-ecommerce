import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger';
import type { ApiResponse } from 'shared/dist'
import {initDb} from "@server/db";
import categories from "@server/categories";

initDb()


const app = new Hono()

app.use('*',logger());
app.use('*',cors());


app.route("/api/categories",categories);
app.get('/health',(c) => c.json({status: 'OK'}));


app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/hello', async (c) => {

  const data: ApiResponse = {
    message: "Hello BHVR!",
    status:200
  }

  return c.json(data, { status: 200 })
})

export default app
