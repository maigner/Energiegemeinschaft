// @ts-nocheck
import { json } from "@sveltejs/kit";
import { SMTP_USER, SMTP_PASSWORD, SMTP_ENDPOINT } from "$env/static/private";
import { dev } from '$app/environment';
import nodemailer from 'nodemailer';

export async function POST({ request, cookies }) {

    const { message } = await request.json();

    console.log("mail.notify " + message);

    if (dev) return json({message: "OK"});

    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: 465,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD,
        },
    });
    /*
        transporter.verify(function (error, success) {
            if (error) {
              console.log(error);
            } else {
              console.log("Server is ready to take our messages");
            }
        });
    */

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
