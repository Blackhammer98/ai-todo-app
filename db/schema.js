import { integer, pgTable, text, timestamp, } from "drizzle-orm/pg-core";


export const todosTable = pgTable("todos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  todo: text().notNull(),
  createdAt : timestamp('created_at').defaultNow(),
  updateAt : timestamp('updated_at').$onUpdate(()=> new Date()),
});