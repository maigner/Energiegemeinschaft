
import { relayContactForm } from '$lib/server/mail/smtp';



/** @type {import('./$types').Actions} */
export const actions = {
    contact: async ({request}) => {
        // TODO get contact form

        console.log("contact");

        const data = await request.formData();
		const email = data.get('email');
		const message = data.get('message');

        console.log({email, message});

        relayContactForm(email, message);


        return {message: "OK"}


    }
};