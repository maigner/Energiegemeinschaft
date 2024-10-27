
import { relayContactForm } from '$lib/server/mail/smtp';

function validateEmail(email) {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
}

/** @type {import('./$types').Actions} */
export const actions = {
    contact: async ({request}) => {
        // TODO get contact form

        console.log("contact");

        const data = await request.formData();
		const email = data.get('email');
		const message = data.get('message');

        if (!validateEmail(email)) {
            return {message: "No"};
        }

        console.log({email, message});

        relayContactForm(email, message);


        return {message: "OK"}


    }
};