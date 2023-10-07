// @ts-nocheck
import { OPENAI_TOKEN } from "$env/static/private";
import { json } from "@sveltejs/kit";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: OPENAI_TOKEN })

export async function POST({ request, cookies }) {

    const { message } = await request.json();    

    const completion = await openai.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: "Du beantwortest Fragen zum Thema Energiegemeinschaft. Du gibst kurze, prägnante Antworten" 
            },
            { 
                role: "user", 
                content: message 
            },

        ],
        model: "gpt-3.5-turbo",
    });

    let result = {
        answer: completion.choices[0]
    }
    
    /*
    let result = {
        answer: {
            message: {
                content: "Foo"
            }
        }
    };
    */

    return json(result);

}