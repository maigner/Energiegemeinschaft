// @ts-nocheck
import { OPENAI_TOKEN } from "$env/static/private";
import { json } from "@sveltejs/kit";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: OPENAI_TOKEN })

export async function POST({ request, cookies }) {

    const { message } = await request.json();
    
    let faq = [
        {
            question: "Wann wurde der Verein gegründet?",
            answer: "Im November 2023."
        },
        {
            question: "Wie teuer ist euer Strom",
            answer: "16 cent pro kWh"
        },
        {
            question: "Wie viel bekomme ich für meine Strom?",
            answer: "15 cent pro kWh"
        },
        {
            question: "Wann ist das nächste Event?",
            answer: "im Jänner 2024 in der Trinkhalle"
        },
        {
            question: "Was ist der Zweck des Vereins ischlstrom",
            answer: "Wir wollen die Energiewende schaffen"
        },
        {
            question: "wer bist du?",
            answer: "Ich bin eine KI, die Sie bei der Energiewende begleitet"
        }

    ]

    const completion = await openai.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: "Du beantwortest Fragen zum Thema Energiegemeinschaft. Du gibst kurze, prägnante Antworten. Du verwendest folgende JSONDatenstruktur, um präzisere Antworten zu geben: " + JSON.stringify(faq) 
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
