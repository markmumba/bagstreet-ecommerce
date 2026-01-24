import {Hono} from "hono";
import {db} from "@server/db";
import type {Category, CategoryRequest} from "@shared/types/category";


const categories = new Hono();

categories.get('/',(c) => {
    try {
        const query = db.query<Category,[]>('SELECT * FROM categories ORDER BY created_at DESC');
        const result = query.get();
        return c.json(result);
    }catch(error) {
        console.error(error);
        return c.json({error:" Failed to fetch categories "}, 500);
    }
})

categories.get('/:categoryId',(c) => {
    try {
        const id = parseInt(c.req.param('categoryId'));
        const query = db.query<Category,[number]>('SELECT * FROM categories WHERE id =?');
        const category = query.get(id);
        if (!category) {
            return c.json({error:" Failed to fetch categories "},404);
        }
        return c.json(category);
    }catch(error) {
        return c.json({error:"failed to fetch categories "},500);
    }
});

categories.post('/',async (c) => {
    try {
        const body = await c.req.json<CategoryRequest>();
        if (!body.name) {
          return c.json({error:"Name is required"}, 400);
        }
        
        const query = db.query(
         ` INSERT INTO categories (name, description)
          VALUES (?,?)
          RETURNING *
          `);
        const  category = query.get(body.name,body.description || null) as Category;
    }
    catch(error:any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        return c.json({error: "Category name already exists"}, 409);
      }
      return c.json({error:'Failed to create Category'},500);
    }
    
});


categories.put('/:id', async (c) => {
    try {
        const id = parseInt(c.req.param('id'));
        const body = await c.req.json<CategoryRequest>();
        
        const checkQuery = db.query('SELECT id FROM categories WHERE id = ?');
        if (!checkQuery.get(id)) {
            return c.json({ error: 'Category not found' }, 404);
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (body.name !== undefined) {
            updates.push('name = ?');
            values.push(body.name);
        }
        if (body.description !== undefined) {
            updates.push('description = ?');
            values.push(body.description);
        }

        if (updates.length === 0) {
            return c.json({ error: 'No fields to update' }, 400);
        }

        values.push(id);

        const query = db.query(`
            UPDATE categories 
            SET ${updates.join(', ')}
            WHERE id = ?
            RETURNING *
        `);
        
        const category = query.get(...values) as Category;
        
        return c.json(category);
    } catch (error: any) {
        if (error.message?.includes('UNIQUE constraint failed')) {
            return c.json({ error: 'Category name already exists' }, 409);
        }
        return c.json({ error: 'Failed to update category' }, 500);
    }
});
categories.delete('/:id', (c) => {
    try {
        const id = parseInt(c.req.param('id'));
        
        const query = db.query('DELETE FROM categories WHERE id = ? RETURNING id');
        const result = query.get(id);
        
        if (!result) {
            return c.json({ error: 'Category not found' }, 404);
        }
        
        return c.json({ message: 'Category deleted successfully' });
    } catch (error) {
        return c.json({ error: 'Failed to delete category' }, 500);
    }
});

export default categories;