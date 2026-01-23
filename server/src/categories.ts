import app from "@server/index";


app.get("/api/v1/categories",(c) => {

    return c.text("Hello Hono!")
})