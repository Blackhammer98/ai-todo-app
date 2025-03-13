import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
import { db } from "./db/index.js";
import { todosTable } from "./db/schema.js";
import { eq, ilike } from 'drizzle-orm';
import readlineSync from 'readline-sync';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const chat = model.startChat();

async function getAllTodos() {
    const todos = await db.select().from(todosTable);
    return todos;
}

async function createTodo(todoContent) { //Accepts todo content.
    const [todo] = await db.insert(todosTable)
        .values({
            todo: todoContent,
        })
        .returning({
            id: todosTable.id
        });
    return todo.id;
}

async function searchTodo(search) {
    const todos = await db.select().from(todosTable).where(ilike(todosTable.todo , `%${search}%`));
    return todos;
}

async function deleteTodoById(id) {
    await db.delete(todosTable).where(eq(todosTable.id, id));
}

const SYSTEM_PROMPT = `
You are a helpful AI Todo assistant. Your task is to manage a todo list.
You have an ability to START, PLAN, ACTION, Observation and OUTPUT.
You first Plan and Then strat taking action and wait for observation based on Action.
Once you get observation, Return the AI response based on START prompt and observation.
After start you get instruction and then action and get back. 
You can perform the following actions with set of tools:

Available tools :

    -createTodo(todoContent: string) : it creates a new todo in todosTable in Database and returns the id of created todo
    -deleteTodoById(id: number) : which delete a todo with specific id
    -getAllTodos() : Return all todos from database
    -searchTodo(query:string) : searches all todos and return a todo which matches that search query

Examples:
START
{"type" : "user", "user": "Add a task for Shopping groceries."}
{"type" : "plan" , "plan" :" I will use createTodo to create a new todo in DB."}
{"type" : "action" , "function" :" createTodo" , "input" : "Shopping for milk , eggs, cooking oil" }
{"type" : "Observation" , "Observation": "3" } 
{"type" : "output" , "output" :" Your todo has been added successfully."}
START
{"type" : "user", "user": "delete todo with id 3"}
{"type" : "plan" , "plan" :" I will use deleteTodoById to delete todo with id 3."}
{"type" : "action" , "function" :" deleteTodoById" , "input" : "3" }
{"type" : "Observation" , "Observation": "todo 3 has been deleted" }
{"type" : "output" , "output" :" todo 3 has been deleted successfully."}

Response Format:
You MUST respond with a JSON object that contains the function call that you want to use.
The response must follow the following format:
{"function" : "functionName", "input" : "input to the function"}
for example to create a todo you will respond with:
{"function" : "createTodo", "input" : "todo content"}

Todo DB Schema : 
id: Int and Primary key
todo : String
created_At : Date Time 
updated_At :Date time onUpdate

Instructions:

- When a user provides a command, parse it and execute the corresponding action.
- If the user provides an invalid command or ID, respond with an appropriate error message.
- Todo IDs are numerical.
- Todo content can be any string.
- Provide clear and concise responses.
- When creating a todo, acknowledge the creation and provide any relevant information (e.g., the assigned ID).
- When deleting a todo, confirm the deletion.
- When getting todos, format the output in a readable way (e.g., a numbered list).
- If no todos exist when GET_ALL is requested, indicate this.
- If a todo with the provided ID does not exist, provide an error message.
- Do not provide any code, only respond with natural language.
- If you cant find relavant response , just provide better option to user.
`;



async function handleTodoRequest(userPrompt) {
   const result = await chat.sendMessage(userPrompt);
    const aiResponse = result.response.text();
    await parseAndExecute(aiResponse);
    console.log("AI:", aiResponse);
}

async function parseAndExecute(aiResponse) {
    console.log("AI Response:", aiResponse); // Debugging: Check the AI response

    if (aiResponse.includes('createTodo')) {

        console.log("createTodo function call detected.");

        const startIndex = aiResponse.indexOf('input": "') + 'input": "'.length;
        const endIndex = aiResponse.indexOf('"', startIndex);
        const todoContent = aiResponse.substring(startIndex, endIndex);

        console.log("Todo Content:", todoContent);

        const todoId = await createTodo(todoContent);
        console.log(`Observation: ${todoId.toString()}`);
    } else if (aiResponse.includes("deleteTodoById")) {
        const startIndex = aiResponse.indexOf("deleteTodoById(") + "deleteTodoById(".length;
        const endIndex = aiResponse.indexOf(")", startIndex);
        const todoId = parseInt(aiResponse.substring(startIndex, endIndex));
        await deleteTodoById(todoId);
        console.log(`Observation: Todo with id ${todoId} deleted`);
    } else if (aiResponse.includes("getAllTodos")) {
        const todos = await getAllTodos();
        console.log(`Observation: ${JSON.stringify(todos)}`);
    } else if (aiResponse.includes("searchTodo")) {
        const startIndex = aiResponse.indexOf('input": "') + 'input": "'.length;
        const endIndex = aiResponse.indexOf('"', startIndex);
        const searchQuery = aiResponse.substring(startIndex, endIndex);
        const todos = await searchTodo(searchQuery);
        console.log(`Observation: ${JSON.stringify(todos)}`);
    }
}

async function main() {
    // Initial greeting from the AI
    await chat.sendMessage(SYSTEM_PROMPT);
    const greetingPrompt = "How can I help you today?";
    const greetingResult = await chat.sendMessage(greetingPrompt);
    const greetingResponse = greetingResult.response.text();
    console.log("AI:", greetingResponse);

    while (true) {
        const userPrompt = readlineSync.question("User: ");
        await handleTodoRequest(userPrompt);
    }
}

main();