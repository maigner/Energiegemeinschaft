import { json } from '@sveltejs/kit';
//open AI testing
import { Configuration, OpenAIApi } from "openai";





/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    const { pageData, query, systemMessage, token } = await request.json();

    //console.log(query, systemMessage);

    //test();


    //console.log("filter by embedding");

    //console.log("add embeddings to gpt query message");

    const configuration = new Configuration({
        apiKey: pageData.params.openAiToken,
    });
    const openai = new OpenAIApi(configuration);

    /*
        console.log("create query embedding");
        const embedding = await openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: query,
        });
    */
    // console.log(embedding?.data.data[0].embedding);


    /*
        const completion = await openai.createChatCompletion({
            //model: "gpt-3.5-turbo",
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: systemMessage,
                },
                { role: "user", content: query },
            ],
            temperature: 0.2,
            //stream: true
        });
        //console.log(completion.data.choices[0].message);
        // @ts-ignore
        let chatbotResponse = completion.data.choices[0].message.content;
    
        return json({ answer: chatbotResponse });
    */

    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    let chatbotResponse = { 'answer': 'OK' };

    //https://github.com/openai/openai-node/issues/18#issuecomment-1367607167
    const body = {
        model: "gpt-4",
        messages: [
            {
                role: "system",
                content: systemMessage,
            },
            { role: "user", content: query },
        ],
        temperature: 0.2,
        stream: true
    }

    const fetchOptions = {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    };

    fetch(apiUrl, fetchOptions).then(async (response) => {
        const r = response.body;
        if (!r) throw new Error('No response body');

        const d = new TextDecoder('utf8');
        const reader = r.getReader();
        let fullText = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log('done');
                break;
            } else {
                const decodedString = d.decode(value);
                console.log(decodedString);
                try {
                    //fixes string not json-parseable otherwise
                    fullText += JSON.parse(decodedString.slice(6)).choices[0].text;
                } catch (e) {
                    // the last line is data: [DONE] which is not parseable either, so we catch that.
                    //console.log(e);
                    //console.log(fullText);
                }
            }
        }
    });

    return json(chatbotResponse);

}


