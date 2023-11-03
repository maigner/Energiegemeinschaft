// @ts-nocheck
import { json } from "@sveltejs/kit";
import { SMTP_USER, SMTP_PASSWORD, SMTP_ENDPOINT, SMTP_TLS_PORT } from "$env/static/private";
import nodemailer from 'nodemailer';

export async function POST({ request, cookies }) {

    const { message } = await request.json();

    console.log("mail.notify " + message);

    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD,
        },
    });
    
    transporter.verify(function (error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log("Server is ready to take our messages");
        }
    });
    

    var mailMessage = {
        from: "martin@maigner.net",
        to: "martin@maigner.net",
        subject: "EEG Wegsite Log",
        text: JSON.stringify(message)
    };

    transporter.sendMail(mailMessage);


    let result = { message: "OK" };

    return json(result);

}
